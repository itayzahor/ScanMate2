import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  Linking,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import Chessboard, { ChessboardRef } from 'react-native-chessboard';
import { Chess, Move, Square, PieceSymbol, Color } from 'chess.js';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { styles } from '../../ui/styles/GameReview.styles';
import type { RootStackParamList } from '../../../App';
import { ScreenHeader } from '../../ui/components/ScreenHeader';
import { BestMoveArrow } from '../../ui/components/BestMoveArrow';
import { FlipToggle } from '../../ui/components/FlipToggle';
import { MoveStrip, VariationChip } from '../../ui/components/MoveStrip';
import { GameNavRow } from '../../ui/components/GameNavRow';
import { AnalysisPanel } from '../../ui/components/AnalysisPanel';
import { analyzePosition, AnalyzePositionResponse } from '../../services/api';
import { getBoardSize } from '../../shared/constants/layout';
import { normalizeFen } from '../../shared/utils/fen';
import { useAuth } from '../context/AuthContext';
import { saveGame } from '../../services/games';
import { SaveTitleModal } from '../../ui/components/SaveTitleModal';
import {
  GameTree,
  buildFromMoves,
  getFenAtPath,
  getSanAtPath,
  getChildrenAtPath,
  getLineLength,
  getMainLine,
  getMainLineLength,
  addMove,
  truncateAfter,
  deleteVariation,
  promoteVariation,
} from '../../shared/utils/gameTree';

/* ── piece assets (same as Analysis) ── */

const PIECE_ASSETS: Record<`${Color}${PieceSymbol}`, ImageSourcePropType> = {
  wp: require('react-native-chessboard/src/assets/wp.png'),
  wn: require('react-native-chessboard/src/assets/wn.png'),
  wb: require('react-native-chessboard/src/assets/wb.png'),
  wr: require('react-native-chessboard/src/assets/wr.png'),
  wq: require('react-native-chessboard/src/assets/wq.png'),
  wk: require('react-native-chessboard/src/assets/wk.png'),
  bp: require('react-native-chessboard/src/assets/bp.png'),
  bn: require('react-native-chessboard/src/assets/bn.png'),
  bb: require('react-native-chessboard/src/assets/bb.png'),
  br: require('react-native-chessboard/src/assets/br.png'),
  bq: require('react-native-chessboard/src/assets/bq.png'),
  bk: require('react-native-chessboard/src/assets/bk.png'),
};

/* ── helpers ── */

const deriveMoveSan = (previous: string, next: string): string => {
  if (!previous) { return 'Start Position'; }
  try {
    const chess = new Chess(previous);
    const moves = chess.moves({ verbose: true }) as Move[];
    for (const move of moves) {
      const cloned = new Chess(previous);
      const result = cloned.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (result && normalizeFen(cloned.fen()) === normalizeFen(next)) {
        return result.san;
      }
    }
  } catch (error) {
    console.warn('[GameReview] Failed to derive SAN', error);
  }
  return '…';
};

/* ── types ── */

type GameReviewProps = NativeStackScreenProps<RootStackParamList, 'GameReview'>;

/* ── component ── */

export const GameReview = ({ route, navigation }: GameReviewProps) => {
  const rawSnapshots = route.params?.snapshots;
  const snapshots = useMemo(() => rawSnapshots ?? [], [rawSnapshots]);
  const passedMoves = route.params?.moves;
  const boardSize = getBoardSize();

  // Build initial SAN list for tree construction
  const initialSans = useMemo<string[]>(() => {
    if (passedMoves && passedMoves.length === snapshots.length - 1) {
      return passedMoves;
    }
    return snapshots.slice(1).map((snap, i) => deriveMoveSan(snapshots[i].fen, snap.fen));
  }, [snapshots, passedMoves]);

  // Game tree + navigation path
  const [tree, setTree] = useState<GameTree>(() =>
    snapshots.length > 0
      ? buildFromMoves(snapshots[0].fen, initialSans)
      : { startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', root: [] }
  );
  const [path, setPath] = useState<number[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [isBoardFlipped, setIsBoardFlipped] = useState(route.params?.flipped ?? false);

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<AnalyzePositionResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState(false);
  const [analysisBaseFen, setAnalysisBaseFen] = useState<string | null>(null);
  const [analysisBaseDepth, setAnalysisBaseDepth] = useState(0);
  const [pvIndex, setPvIndex] = useState(0);
  const [displayFen, setDisplayFen] = useState<string | null>(null);

  const chessboardRef = useRef<ChessboardRef>(null);

  useEffect(() => {
    if (!snapshots.length) {
      Alert.alert('No Data', 'No frames were captured.');
      navigation.goBack();
    }
  }, [snapshots.length, navigation]);

  // Derived values from tree + path
  const gameFen = getFenAtPath(tree, path);
  const currentFen = displayFen ?? gameFen;
  const currentDepth = path.length;
  const totalMainLine = getMainLineLength(tree);
  const lineLen = getLineLength(tree, path);

  // Strip labels
  const currSan = getSanAtPath(tree, path);
  const prevSan = path.length >= 2 ? getSanAtPath(tree, path.slice(0, -1)) : null;
  const nextChildren = getChildrenAtPath(tree, path);
  const nextSan = nextChildren.length > 0 ? nextChildren[0].san : null;

  // Variation chips for MoveStrip
  const variationChips: VariationChip[] = useMemo(
    () => nextChildren.map((c, i) => ({ san: c.san, childIndex: i })),
    [nextChildren],
  );

  // PV playback data
  const primaryLine = analysisResult?.lines?.[0];

  const playbackData = useMemo(() => {
    if (!analysisBaseFen || !primaryLine) { return null; }
    const pvMoves = primaryLine.pv ?? [];
    const chess = new Chess(analysisBaseFen);
    const states: string[] = [analysisBaseFen];
    const moves: Array<{ from: Square; to: Square; san: string }> = [];

    for (const san of pvMoves) {
      try {
        const move = chess.move(san);
        if (!move) { break; }
        moves.push({ from: move.from as Square, to: move.to as Square, san });
        states.push(chess.fen());
      } catch {
        break;
      }
    }
    return { states, moves };
  }, [analysisBaseFen, primaryLine]);

  const playbackMoveCount = playbackData?.moves.length ?? 0;
  const canStepForward = playbackMoveCount > 0 && pvIndex < playbackMoveCount;
  const canStepBackward = playbackMoveCount > 0 && pvIndex > 0;

  // Arrow for upcoming PV move
  const upcomingMove = playbackData && pvIndex < playbackData.moves.length
    ? playbackData.moves[pvIndex]
    : null;
  const fallbackBestMove = useMemo(() => {
    const move = primaryLine?.best_move;
    if (!move || move.length < 4) { return { from: null, to: null }; }
    return { from: move.slice(0, 2) as Square, to: move.slice(2, 4) as Square };
  }, [primaryLine]);

  const arrowFrom = analysisMode ? (upcomingMove?.from ?? fallbackBestMove.from) : null;
  const arrowTo = analysisMode ? (upcomingMove?.to ?? fallbackBestMove.to) : null;

  // ── Navigation — path-based ──

  const exitAnalysis = useCallback(() => {
    setAnalysisMode(false);
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisBaseFen(null);
    setDisplayFen(null);
    setPvIndex(0);
  }, []);

  const navigateTo = useCallback((newPath: number[]) => {
    setPath(newPath);
    exitAnalysis();
    const fen = getFenAtPath(tree, newPath);
    chessboardRef.current?.resetBoard(fen);
  }, [tree, exitAnalysis]);

  const goForward = useCallback(() => {
    const children = getChildrenAtPath(tree, path);
    if (children.length === 0) { return; }
    navigateTo([...path, 0]);
  }, [tree, path, navigateTo]);

  const goBack = useCallback(() => {
    if (path.length === 0) { return; }
    navigateTo(path.slice(0, -1));
  }, [path, navigateTo]);

  const goFirst = useCallback(() => navigateTo([]), [navigateTo]);

  const goLast = useCallback(() => {
    let p = [...path];
    let children = getChildrenAtPath(tree, p);
    while (children.length > 0) {
      p = [...p, 0];
      children = getChildrenAtPath(tree, p);
    }
    navigateTo(p);
  }, [tree, path, navigateTo]);

  const handleSelectVariation = useCallback((childIndex: number) => {
    navigateTo([...path, childIndex]);
  }, [path, navigateTo]);

  // PV stepping — also animates
  const stepToIndex = useCallback((targetIndex: number) => {
    if (!playbackData) { return; }
    const maxIndex = playbackData.states.length - 1;
    const nextIndex = Math.min(Math.max(targetIndex, 0), maxIndex);
    if (nextIndex === pvIndex) { return; }
    const nextFen = playbackData.states[nextIndex];
    setDisplayFen(nextFen);
    setPvIndex(nextIndex);
    chessboardRef.current?.resetBoard(nextFen);
  }, [playbackData, pvIndex]);

  const handlePlaybackForward = useCallback(() => stepToIndex(pvIndex + 1), [pvIndex, stepToIndex]);
  const handlePlaybackBackward = useCallback(() => stepToIndex(pvIndex - 1), [pvIndex, stepToIndex]);
  const handlePlaybackReset = useCallback(() => stepToIndex(0), [stepToIndex]);

  // Analyze current position → enter analysis mode
  const handleAnalyze = useCallback(async () => {
    if (!gameFen) { return; }
    try {
      setIsAnalyzing(true);
      setAnalysisError(null);
      const response = await analyzePosition(gameFen, { depth: 18, multipv: 1 });
      setAnalysisResult(response);
      setAnalysisBaseFen(gameFen);
      setAnalysisBaseDepth(currentDepth);
      setAnalysisMode(true);
      setPvIndex(0);
      setDisplayFen(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run engine analysis.';
      setAnalysisError(message);
      Alert.alert('Analysis failed', message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [gameFen, currentDepth]);

  // Return to game from analysis mode
  const handleReturnToGame = useCallback(() => {
    exitAnalysis();
    if (gameFen) {
      chessboardRef.current?.resetBoard(gameFen);
    }
  }, [gameFen, exitAnalysis]);

  // Save & Export
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const defaultTitle = `Game – ${new Date().toLocaleDateString()}`;
  const mainLineMoves = useMemo(() => getMainLine(tree), [tree]);

  const handleSavePress = useCallback(() => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in from the home screen to save games.');
      return;
    }
    if (!snapshots.length) { return; }
    setSaveModalVisible(true);
  }, [user, snapshots]);

  const handleSaveConfirm = useCallback(async (title: string) => {
    setSaveModalVisible(false);
    setSaving(true);
    try {
      const startFen = tree.startFen;
      const moves = getMainLine(tree);
      const chess = new Chess(startFen);
      moves.forEach(san => chess.move(san));
      const finalFen = chess.fen();

      await saveGame({
        title,
        moves,
        startingFen: startFen,
        finalFen,
        source: 'scan',
      });
      Alert.alert('Saved', 'Game saved to your library.');
    } catch (err: any) {
      Alert.alert('Save Failed', err.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }, [tree]);

  const handleExport = useCallback(() => {
    if (!mainLineMoves.length) {
      Alert.alert('No Moves', 'No moves to export.');
      return;
    }
    const pgn = mainLineMoves.map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m}` : m)).join(' ');
    const url = `https://lichess.org/paste?pgn=${encodeURIComponent(pgn)}`;
    Linking.openURL(url);
  }, [mainLineMoves]);

  // Flip board (pieces stay upright via renderPiece counter-rotation)
  const boardTransformStyle = useMemo(
    () => ({ transform: [{ rotate: isBoardFlipped ? '180deg' : '0deg' }] }),
    [isBoardFlipped],
  );

  const renderChessPiece = useCallback(
    (piece: `${string}${PieceSymbol}`) => {
      const assetKey = (piece as keyof typeof PIECE_ASSETS) ?? 'wp';
      const source = PIECE_ASSETS[assetKey] ?? PIECE_ASSETS.wp;
      return (
        <Image
          source={source}
          style={{
            width: boardSize / 8,
            height: boardSize / 8,
            transform: [{ rotate: isBoardFlipped ? '180deg' : '0deg' }],
          }}
          resizeMode="contain"
        />
      );
    },
    [boardSize, isBoardFlipped],
  );

  // Edit mode handlers
  const handleEditMove = useCallback((info: any) => {
    const fen = info?.state?.fen;
    if (!fen) { return; }
    const currentBoardFen = getFenAtPath(tree, path);
    const chess = new Chess(currentBoardFen);
    const legalMoves = chess.moves({ verbose: true }) as Move[];

    let san: string | null = null;
    for (const move of legalMoves) {
      const test = new Chess(currentBoardFen);
      const result = test.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (result && normalizeFen(test.fen()) === normalizeFen(fen)) {
        san = result.san;
        break;
      }
    }
    if (!san) {
      chessboardRef.current?.resetBoard(currentBoardFen);
      return;
    }
    const result = addMove(tree, path, san);
    setTree(result.tree);
    setPath(result.path);
  }, [tree, path]);

  const handleTruncate = useCallback(() => {
    Alert.alert('Truncate', 'Remove all moves after this position?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Truncate', style: 'destructive', onPress: () => setTree(truncateAfter(tree, path)) },
    ]);
  }, [tree, path]);

  const handleDeleteVariation = useCallback(() => {
    if (path.length === 0) { return; }
    const lastIdx = path[path.length - 1];
    if (lastIdx === 0) {
      Alert.alert('Cannot Delete', 'This is the main line. Promote another variation first.');
      return;
    }
    Alert.alert('Delete Variation', 'Delete this variation branch?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        const result = deleteVariation(tree, path);
        setTree(result.tree);
        setPath(result.path);
        chessboardRef.current?.resetBoard(getFenAtPath(result.tree, result.path));
      }},
    ]);
  }, [tree, path]);

  const handlePromoteVariation = useCallback(() => {
    if (path.length === 0) { return; }
    const lastIdx = path[path.length - 1];
    if (lastIdx === 0) { return; }
    const newTree = promoteVariation(tree, path);
    const newPath = [...path.slice(0, -1), 0];
    setTree(newTree);
    setPath(newPath);
  }, [tree, path]);

  // Status flags for edit toolbar
  const isOnVariation = path.length > 0 && path[path.length - 1] > 0;
  const hasChildren = nextChildren.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Game Review"
        subtitle={
          analysisMode
            ? `Analyzing move ${analysisBaseDepth}/${totalMainLine}`
            : editMode
            ? 'Edit Mode — drag to play'
            : `${totalMainLine} move${totalMainLine !== 1 ? 's' : ''} detected`
        }
        onBack={() => navigation.goBack()}
        style={styles.header}
      />

      {/* Board */}
      {currentFen && (
        <View style={[styles.boardWrapper, { width: boardSize, height: boardSize }, boardTransformStyle]}>
          <Chessboard
            ref={chessboardRef}
            fen={currentFen}
            boardSize={boardSize}
            gestureEnabled={editMode && !analysisMode}
            onMove={editMode && !analysisMode ? handleEditMove : undefined}
            renderPiece={renderChessPiece}
          />
          <BestMoveArrow from={arrowFrom} to={arrowTo} boardSize={boardSize} />
        </View>
      )}

      {/* Toolbar: flip + edit + analyze/return */}
      <View style={styles.toolbarRow}>
        <FlipToggle isFlipped={isBoardFlipped} onChange={setIsBoardFlipped} />

        {!analysisMode && (
          <TouchableOpacity
            style={[styles.toolbarButton, editMode && styles.editButtonActive]}
            onPress={() => setEditMode(e => !e)}
          >
            <Text style={styles.toolbarButtonText}>{editMode ? '✅ Done' : '✏️ Edit'}</Text>
          </TouchableOpacity>
        )}

        {analysisMode ? (
          <TouchableOpacity style={[styles.toolbarButton, styles.returnButton]} onPress={handleReturnToGame}>
            <Text style={styles.toolbarButtonText}>↩ Back to Game</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.toolbarButton, styles.analyzeToolbarButton, (!gameFen || isAnalyzing) && styles.analyzeButtonDisabled]}
            disabled={!gameFen || isAnalyzing}
            onPress={handleAnalyze}
          >
            {isAnalyzing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.toolbarButtonText}>🚀 Analyze</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Edit toolbar: truncate / promote / delete */}
      {editMode && !analysisMode && (
        <View style={styles.toolbarRow}>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.truncateButton, !hasChildren && styles.analyzeButtonDisabled]}
            disabled={!hasChildren}
            onPress={handleTruncate}
          >
            <Text style={styles.toolbarButtonText}>✂ Truncate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.promoteButton, !isOnVariation && styles.analyzeButtonDisabled]}
            disabled={!isOnVariation}
            onPress={handlePromoteVariation}
          >
            <Text style={styles.toolbarButtonText}>⬆ Promote</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.deleteButton, !isOnVariation && styles.analyzeButtonDisabled]}
            disabled={!isOnVariation}
            onPress={handleDeleteVariation}
          >
            <Text style={styles.toolbarButtonText}>🗑 Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Save / Export row */}
      {!analysisMode && !editMode && (
        <View style={styles.toolbarRow}>
          <TouchableOpacity
            style={[styles.toolbarButton, {backgroundColor: '#1c3a2a'}]}
            onPress={handleSavePress}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.toolbarButtonText}>💾 Save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, {backgroundColor: '#1c2b4b'}]}
            onPress={handleExport}>
            <Text style={styles.toolbarButtonText}>↗ Export</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, {backgroundColor: '#2b1c4b'}]}
            onPress={() => navigation.navigate('Friends', {challengeFen: gameFen})}>
            <Text style={styles.toolbarButtonText}>⚔️ Challenge</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Analysis PV panel (shown in analysis mode) */}
      {analysisMode && primaryLine && (
        <AnalysisPanel
          primaryLine={primaryLine}
          pvIndex={pvIndex}
          playbackMoveCount={playbackMoveCount}
          canStepForward={canStepForward}
          canStepBackward={canStepBackward}
          onForward={handlePlaybackForward}
          onBackward={handlePlaybackBackward}
          onReset={handlePlaybackReset}
        />
      )}

      {analysisError && <Text style={styles.analysisError}>{analysisError}</Text>}

      {/* Move strip */}
      {!analysisMode && (
        <MoveStrip
          prevLabel={prevSan}
          currLabel={currSan}
          nextLabel={nextSan}
          currentDepth={currentDepth}
          lineLength={lineLen}
          onPrev={goBack}
          onNext={goForward}
          variations={variationChips}
          activeChildIndex={0}
          onSelectVariation={handleSelectVariation}
        />
      )}

      {/* Navigation arrows */}
      {!analysisMode && (
        <GameNavRow
          canGoBack={path.length > 0}
          canGoForward={nextChildren.length > 0}
          onFirst={goFirst}
          onPrev={goBack}
          onNext={goForward}
          onLast={goLast}
        />
      )}

      <SaveTitleModal
        visible={saveModalVisible}
        defaultTitle={defaultTitle}
        onSave={handleSaveConfirm}
        onCancel={() => setSaveModalVisible(false)}
      />
    </SafeAreaView>
  );
};
