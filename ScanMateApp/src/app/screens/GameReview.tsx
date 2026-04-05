/**
 * GameReview.tsx — Post-game review & analysis screen.
 *
 * Responsibilities:
 *  - Receives a list of GameSnapshots (FEN + timestamp) from ScanGame
 *    and builds an interactive game tree supporting variations.
 *  - Provides step-through navigation (first / prev / next / last) plus
 *    a MoveStrip showing context around the current position.
 *  - Edit mode lets the user drag pieces to add new moves / variations,
 *    truncate the line, promote or delete variation branches.
 *  - "Analyze" sends the current FEN to the engine and enters analysis
 *    mode with PV playback and a best-move arrow overlay.
 *  - Save (to user library), Export (Lichess PGN paste), and Challenge
 *    (invite a friend from this position) actions.
 *  - "Record Game from This Position" re-enters ScanGame with the
 *    current FEN as the starting position.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import Chessboard, { ChessboardRef } from 'react-native-chessboard';
import { Chess, Move } from 'chess.js';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { styles } from '../../ui/styles/GameReview.styles';
import type { RootStackParamList } from '../../shared/types/navigation';
import { ScreenHeader } from '../../ui/components/ScreenHeader';
import { BestMoveArrow } from '../../ui/components/BestMoveArrow';
import { FlipToggle } from '../../ui/components/FlipToggle';
import { MoveStrip, VariationChip } from '../../ui/components/MoveStrip';
import { GameNavRow } from '../../ui/components/GameNavRow';
import { AnalysisPanel } from '../../ui/components/AnalysisPanel';
import { analyzePosition } from '../../services/api';
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
import { useRenderPiece } from '../../shared/hooks/useRenderPiece';
import { useAnalysisPlayback } from '../../shared/hooks/useAnalysisPlayback';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Derives the SAN notation for the move that transforms `previous`
 * into `next` by brute-forcing all legal moves from `previous`.
 * Returns '…' if no legal move matches (e.g. a manually edited FEN).
 */
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

// ── Types ────────────────────────────────────────────────────────────

type GameReviewProps = NativeStackScreenProps<RootStackParamList, 'GameReview'>;

// ── Component ───────────────────────────────────────────────────────

/**
 * Interactive game review with a full game tree, edit mode,
 * engine analysis, save/export, and friend challenge.
 */
export const GameReview = ({ route, navigation }: GameReviewProps) => {
  const rawSnapshots = route.params?.snapshots;
  const snapshots = useMemo(() => rawSnapshots ?? [], [rawSnapshots]);
  const passedMoves = route.params?.moves;
  const boardSize = getBoardSize();

  // ── Game tree construction ──────────────────────────────────────────

  /** Build initial SAN list — prefer server-provided moves, fall back to brute-force derivation. */
  const initialSans = useMemo<string[]>(() => {
    if (passedMoves && passedMoves.length === snapshots.length - 1) {
      return passedMoves;
    }
    return snapshots.slice(1).map((snap, i) => deriveMoveSan(snapshots[i].fen, snap.fen));
  }, [snapshots, passedMoves]);

  /** Mutable game tree supporting main line + variations. */
  const [tree, setTree] = useState<GameTree>(() =>
    snapshots.length > 0
      ? buildFromMoves(snapshots[0].fen, initialSans)
      : { startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', root: [] }
  );
  /** Path into the tree — array of child indices at each depth. */
  const [path, setPath] = useState<number[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [isBoardFlipped, setIsBoardFlipped] = useState(route.params?.flipped ?? false);

  // ── Analysis state ──────────────────────────────────────────────────
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  /** True while the bottom panel shows engine PV instead of game moves. */
  const [analysisMode, setAnalysisMode] = useState(false);
  /** FEN that was sent to the engine (may differ from current display during PV playback). */
  const [analysisBaseFen, setAnalysisBaseFen] = useState<string | null>(null);
  const [analysisBaseDepth, setAnalysisBaseDepth] = useState(0);
  /** When non-null, overrides gameFen for board display (used during PV playback). */
  const [displayFen, setDisplayFen] = useState<string | null>(null);

  const {
    setAnalysisResult,
    primaryLine,
    pvIndex, setPvIndex,
    playbackMoveCount,
    canStepForward, canStepBackward,
    arrowFrom: pvArrowFrom, arrowTo: pvArrowTo,
    stepToIndex,
    resetPlayback,
  } = useAnalysisPlayback(analysisBaseFen);

  // Best-move arrow — only show while in analysis mode
  const arrowFrom = analysisMode ? pvArrowFrom : null;
  const arrowTo = analysisMode ? pvArrowTo : null;

  const chessboardRef = useRef<ChessboardRef>(null);

  // Bail out if no snapshots were provided
  useEffect(() => {
    if (!snapshots.length) {
      Alert.alert('No Data', 'No frames were captured.');
      navigation.goBack();
    }
  }, [snapshots.length, navigation]);

  // ── Derived values from tree + path ─────────────────────────────────

  const gameFen = getFenAtPath(tree, path);
  /** Board shows PV playback FEN when available, otherwise the game position. */
  const currentFen = displayFen ?? gameFen;
  const currentDepth = path.length;
  const totalMainLine = getMainLineLength(tree);
  const lineLen = getLineLength(tree, path);

  // Labels for the MoveStrip component (previous / current / next SAN)
  const currSan = getSanAtPath(tree, path);
  const prevSan = path.length >= 2 ? getSanAtPath(tree, path.slice(0, -1)) : null;
  const nextChildren = getChildrenAtPath(tree, path);
  const nextSan = nextChildren.length > 0 ? nextChildren[0].san : null;

  /** Chips for branching variations at the current node. */
  const variationChips: VariationChip[] = useMemo(
    () => nextChildren.map((c, i) => ({ san: c.san, childIndex: i })),
    [nextChildren],
  );

  // ── Navigation — path-based ─────────────────────────────────────────

  /** Exits analysis mode, resets PV playback, and clears overrides. */
  const exitAnalysis = useCallback(() => {
    setAnalysisMode(false);
    resetPlayback();
    setAnalysisError(null);
    setAnalysisBaseFen(null);
    setDisplayFen(null);
  }, [resetPlayback]);

  /** Jumps to an arbitrary tree path, exits analysis, and syncs the board. */
  const navigateTo = useCallback((newPath: number[]) => {
    setPath(newPath);
    exitAnalysis();
    const fen = getFenAtPath(tree, newPath);
    chessboardRef.current?.resetBoard(fen);
  }, [tree, exitAnalysis]);

  /** Steps one move forward along the current branch (child index 0). */
  const goForward = useCallback(() => {
    const children = getChildrenAtPath(tree, path);
    if (children.length === 0) { return; }
    navigateTo([...path, 0]);
  }, [tree, path, navigateTo]);

  /** Steps one move backward (pops the last index from path). */
  const goBack = useCallback(() => {
    if (path.length === 0) { return; }
    navigateTo(path.slice(0, -1));
  }, [path, navigateTo]);

  /** Jumps to the starting position (empty path). */
  const goFirst = useCallback(() => navigateTo([]), [navigateTo]);

  /** Walks down child-0 at every node until the end of the line. */
  const goLast = useCallback(() => {
    let p = [...path];
    let children = getChildrenAtPath(tree, p);
    while (children.length > 0) {
      p = [...p, 0];
      children = getChildrenAtPath(tree, p);
    }
    navigateTo(p);
  }, [tree, path, navigateTo]);

  /** Enters a specific variation branch at the current node. */
  const handleSelectVariation = useCallback((childIndex: number) => {
    navigateTo([...path, childIndex]);
  }, [path, navigateTo]);

  // ── PV playback stepping ────────────────────────────────────────────

  /** Steps the PV playback to a specific index and updates the board. */
  const handlePvStep = useCallback((targetIndex: number) => {
    stepToIndex(targetIndex, (nextFen) => {
      setDisplayFen(nextFen);
      chessboardRef.current?.resetBoard(nextFen);
    });
  }, [stepToIndex]);

  const handlePlaybackForward = useCallback(() => handlePvStep(pvIndex + 1), [pvIndex, handlePvStep]);
  const handlePlaybackBackward = useCallback(() => handlePvStep(pvIndex - 1), [pvIndex, handlePvStep]);
  const handlePlaybackReset = useCallback(() => handlePvStep(0), [handlePvStep]);

  // ── Engine analysis ─────────────────────────────────────────────────

  /** Sends the current game FEN to the engine and enters analysis mode. */
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
  }, [gameFen, currentDepth, setAnalysisResult, setPvIndex]);

  /** Leaves analysis mode and resets the board to the game position. */
  const handleReturnToGame = useCallback(() => {
    exitAnalysis();
    if (gameFen) {
      chessboardRef.current?.resetBoard(gameFen);
    }
  }, [gameFen, exitAnalysis]);

  // ── Save & Export ───────────────────────────────────────────────────

  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const defaultTitle = `Game – ${new Date().toLocaleDateString()}`;
  const mainLineMoves = useMemo(() => getMainLine(tree), [tree]);

  /** Opens the save-title modal (requires sign-in). */
  const handleSavePress = useCallback(() => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in from the home screen to save games.');
      return;
    }
    if (!snapshots.length) { return; }
    setSaveModalVisible(true);
  }, [user, snapshots]);

  /** Persists the main line to the user's game library. */
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

  /** Builds a numbered PGN string and opens the Lichess paste URL. */
  const handleExport = useCallback(() => {
    if (!mainLineMoves.length) {
      Alert.alert('No Moves', 'No moves to export.');
      return;
    }
    const pgn = mainLineMoves.map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m}` : m)).join(' ');
    const url = `https://lichess.org/paste?pgn=${encodeURIComponent(pgn)}`;
    Linking.openURL(url).catch(() => {});
  }, [mainLineMoves]);

  // ── Board rendering ─────────────────────────────────────────────────

  // Flip transform — pieces stay upright via renderPiece counter-rotation
  const boardTransformStyle = useMemo(
    () => ({ transform: [{ rotate: isBoardFlipped ? '180deg' : '0deg' }] }),
    [isBoardFlipped],
  );

  const renderChessPiece = useRenderPiece(boardSize, isBoardFlipped);

  // ── Edit mode handlers ──────────────────────────────────────────────

  /**
   * Called when the user drags a piece in edit mode.
   * Matches the resulting FEN against legal moves to find the SAN,
   * then inserts it into the game tree (creating a variation if needed).
   */
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

  /** Asks for confirmation then removes all moves after the current position. */
  const handleTruncate = useCallback(() => {
    Alert.alert('Truncate', 'Remove all moves after this position?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Truncate', style: 'destructive', onPress: () => setTree(truncateAfter(tree, path)) },
    ]);
  }, [tree, path]);

  /** Deletes a non-main-line variation branch (with confirmation). */
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

  /** Swaps a side-line with the main line at the branch point. */
  const handlePromoteVariation = useCallback(() => {
    if (path.length === 0) { return; }
    const lastIdx = path[path.length - 1];
    if (lastIdx === 0) { return; }
    const newTree = promoteVariation(tree, path);
    const newPath = [...path.slice(0, -1), 0];
    setTree(newTree);
    setPath(newPath);
  }, [tree, path]);

  // ── Status flags for edit toolbar ───────────────────────────────────

  /** True when the current path ends on a side-line (not child 0). */
  const isOnVariation = path.length > 0 && path[path.length - 1] > 0;
  const hasChildren = nextChildren.length > 0;

  // ── Render ─────────────────────────────────────────────────────────

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

      {/* Primary toolbar: flip / edit toggle / analyze (or return) */}
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

      {/* Edit toolbar: truncate / promote / delete (only in edit mode) */}
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

      {/* Save / Export / Challenge row (hidden during edit & analysis) */}
      {!analysisMode && !editMode && (
        <View style={styles.toolbarRow}>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.saveButton]}
            onPress={handleSavePress}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.toolbarButtonText}>💾 Save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.exportButton]}
            onPress={handleExport}>
            <Text style={styles.toolbarButtonText}>↗ Export</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.challengeButton]}
            onPress={() => {
              if (!user) {
                Alert.alert('Sign In Required', 'Please sign in from the home screen to challenge friends.');
                return;
              }
              navigation.navigate('Friends', {challengeFen: gameFen});
            }}>
            <Text style={styles.toolbarButtonText}>⚔️ Challenge</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Record from this position (hidden during edit & analysis) */}
      {!analysisMode && !editMode && (
        <View style={styles.recordRow}>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.recordButton]}
            onPress={() => navigation.navigate('ScanGame', {startingFen: gameFen ?? undefined})}>
            <Text style={styles.toolbarButtonText}>🎬 Record Game from This Position</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Engine PV panel (analysis mode only) */}
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

      {/* Move strip with variation chips (game mode only) */}
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

      {/* First / Prev / Next / Last navigation (game mode only) */}
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
