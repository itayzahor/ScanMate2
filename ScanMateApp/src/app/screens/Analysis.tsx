import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import Chessboard, { ChessboardRef } from 'react-native-chessboard';
import { Square, PieceSymbol, Color, Move } from 'chess.js';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../shared/types/navigation';
import { styles } from '../../ui/styles/Analysis.styles';
import { analyzePosition } from '../../services/api';
import { ScreenHeader } from '../../ui/components/ScreenHeader';
import { normalizeFen, STARTING_FEN } from '../../shared/utils/fen';
import { getBoardSize } from '../../shared/constants/layout';
import { SaveTitleModal } from '../../ui/components/SaveTitleModal';
import { useAuth } from '../context/AuthContext';
import { saveGame } from '../../services/games';
import { FlipToggle } from '../../ui/components/FlipToggle';
import { SideToMoveToggle } from '../../ui/components/SideToMoveToggle';
import { PieceSelectorModal } from '../../ui/components/PieceSelectorModal';
import { PromotionModal } from '../../ui/components/PromotionModal';
import { OverlayRow } from '../../ui/components/BoardOverlayRow';
import { useAnalysisPlayback } from '../../shared/hooks/useAnalysisPlayback';
import { useRenderPiece } from '../../shared/hooks/useRenderPiece';
import { BOARD_SQUARE_ROWS } from '../../shared/constants/board';
import { reverseSquare, getSquareCenter } from '../../shared/utils/board';
import {
  loadChess,
  generatePseudoMoves,
  FenUtils,
  formatEvaluation,
} from '../../shared/utils/fenEditor';

// --- TYPES ---
type CandidateMove = {
  from: Square;
  to: Square;
  logicFrom: Square;
  logicTo: Square;
  promotion?: PieceSymbol;
  isFree?: boolean;
};

// --- COMPONENTS ---

/**
 * The "Window" that pops up to select a piece
 */
type BestMoveArrowProps = {
  from?: Square | null;
  to?: Square | null;
  boardPixels: number | null;
};

const BestMoveArrow: React.FC<BestMoveArrowProps> = ({ from, to, boardPixels }) => {
  if (!from || !to || !boardPixels) {
    return null;
  }

  const fromCenter = getSquareCenter(from, boardPixels);
  const toCenter = getSquareCenter(to, boardPixels);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const thickness = Math.max(4, boardPixels * 0.01);
  const headSize = Math.max(12, boardPixels * 0.04);
  const bodyLength = Math.max(0, distance - headSize * 0.8);

  return (
    <View pointerEvents="none" style={styles.arrowLayer}>
      <View
        style={[
          styles.arrowWrapper,
          {
            transform: [
              { translateX: fromCenter.x },
              { translateY: fromCenter.y },
              { rotate: `${angle}deg` },
            ],
          },
        ]}
      >
        <View
          style={[
            styles.arrowBody,
            {
              width: bodyLength,
              height: thickness,
              top: -thickness / 2,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.arrowHead,
          {
            width: headSize,
            height: headSize,
            left: toCenter.x - headSize / 2,
            top: toCenter.y - headSize / 2,
            transform: [{ rotate: `${angle + 45}deg` }],
          },
        ]}
      />
    </View>
  );
};

// --- MAIN SCREEN ---

type AnalysisScreenProps = NativeStackScreenProps<RootStackParamList, 'Analysis'>;

export default function AnalysisScreen({ route, navigation }: AnalysisScreenProps) {
  const initialFen = normalizeFen(route.params?.fen ?? STARTING_FEN);
  
  const [fen, setFen] = useState<string>(initialFen);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisBaseFen, setAnalysisBaseFen] = useState<string | null>(null);
  const [overlayPixels, setOverlayPixels] = useState<number | null>(null);
  const [isBoardFlipped, setIsBoardFlipped] = useState(false);
  const [isMovementReversed, setIsMovementReversed] = useState(false);
  const [promotionContext, setPromotionContext] = useState<{ move: CandidateMove; color: Color } | null>(null);
  const chessboardRef = useRef<ChessboardRef>(null);
  const navigationFen = route.params?.fen;
  const selectedMoveFromRef = useRef<Square | null>(null);
  const candidateMovesRef = useRef<CandidateMove[]>([]);

  const {
    analysisResult, setAnalysisResult,
    primaryLine,
    pvIndex, setPvIndex,
    playbackMoveCount,
    canStepForward, canStepBackward,
    arrowFrom, arrowTo,
    stepToIndex,
    resetPlayback,
  } = useAnalysisPlayback(analysisBaseFen);

  // Save & Export
  const { user } = useAuth();
  const [savingPosition, setSavingPosition] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const defaultPositionTitle = `Position – ${new Date().toLocaleDateString()}`;

  const handleSavePositionPress = useCallback(() => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in from the home screen to save positions.');
      return;
    }
    setSaveModalVisible(true);
  }, [user]);

  const handleSavePositionConfirm = useCallback(async (title: string) => {
    setSaveModalVisible(false);
    setSavingPosition(true);
    try {
      await saveGame({
        title,
        startingFen: fen,
        source: 'manual',
      });
      Alert.alert('Saved', 'Position saved to your library.');
    } catch (err: any) {
      Alert.alert('Save Failed', err.message ?? 'Something went wrong');
    } finally {
      setSavingPosition(false);
    }
  }, [fen]);

  const handleExportPosition = useCallback(() => {
    const url = `https://lichess.org/analysis/${encodeURIComponent(fen)}`;
    Linking.openURL(url);
  }, [fen]);

  const transformFenForMovement = useCallback(
    (value: string) => (isMovementReversed ? FenUtils.reverseFen(value) : value),
    [isMovementReversed],
  );

  const mapSquareForMovement = useCallback(
    (square: Square) => (isMovementReversed ? reverseSquare(square) : square),
    [isMovementReversed],
  );

  const getPromotionColor = useCallback(
    (move: CandidateMove): Color | null => {
      const movingPiece = FenUtils.getPieceAt(fen, move.from);
      if (!movingPiece || movingPiece.type !== 'p') {
        return null;
      }
      const targetRank = Number(move.to[1]);
      const whitePromotionRank = isMovementReversed ? 1 : 8;
      const blackPromotionRank = isMovementReversed ? 8 : 1;
      if (
        (movingPiece.color === 'w' && targetRank === whitePromotionRank) ||
        (movingPiece.color === 'b' && targetRank === blackPromotionRank)
      ) {
        return movingPiece.color;
      }
      return null;
    },
    [fen, isMovementReversed],
  );

  const runOnNextFrame = useCallback((fn: () => void) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(fn);
      return;
    }
    setTimeout(fn, 0);
  }, []);

  const resetHighlights = useCallback(() => {
    chessboardRef.current?.resetAllHighlightedSquares();
  }, []);

  const highlightSquare = useCallback(
    (square: Square, color: string) => {
      runOnNextFrame(() => {
        chessboardRef.current?.highlight({ square, color });
      });
    },
    [runOnNextFrame],
  );

  const applyFenUpdate = useCallback((nextFen: string) => {
    const normalized = normalizeFen(nextFen);
    setFen(normalized);
    chessboardRef.current?.resetBoard(normalized);
  }, []);

  const clearAnalysisState = useCallback(() => {
    resetPlayback();
    setAnalysisError(null);
    setAnalysisBaseFen(null);
  }, [resetPlayback]);

  const clearMoveSelection = useCallback(() => {
    selectedMoveFromRef.current = null;
    candidateMovesRef.current = [];
    resetHighlights();
  }, [resetHighlights]);

  const executeCandidateMove = useCallback(
    (move: CandidateMove, promotionOverride?: PieceSymbol) => {
      const resolvedPromotion = promotionOverride ?? move.promotion;
      if (move.isFree) {
        const logicFen = transformFenForMovement(fen);
        const nextLogicFen = FenUtils.movePieceFreely(
          logicFen,
          move.logicFrom,
          move.logicTo,
          resolvedPromotion,
        );
        const nextFen = transformFenForMovement(nextLogicFen);
        clearAnalysisState();
        applyFenUpdate(nextFen);
        clearMoveSelection();
        return;
      }

      const logicFen = transformFenForMovement(fen);
      const chess = loadChess(logicFen);
      if (!chess) {
        clearMoveSelection();
        return;
      }

      const moveResult = chess.move({
        from: move.logicFrom,
        to: move.logicTo,
        promotion: resolvedPromotion,
      });

      if (moveResult) {
        const updatedFen = transformFenForMovement(chess.fen());
        clearAnalysisState();
        applyFenUpdate(updatedFen);
      }

      clearMoveSelection();
    },
    [
      fen,
      applyFenUpdate,
      clearAnalysisState,
      clearMoveSelection,
      transformFenForMovement,
    ],
  );

  useEffect(() => {
    clearMoveSelection();
  }, [fen, clearMoveSelection]);

  useEffect(() => {
    if (!navigationFen) {
      return;
    }
    const normalized = normalizeFen(navigationFen);
    clearAnalysisState();
    applyFenUpdate(normalized);
  }, [navigationFen, clearAnalysisState, applyFenUpdate]);

  const canResetPlayback = canStepBackward;

  const handlePlaybackForward = useCallback(() => {
    stepToIndex(pvIndex + 1, applyFenUpdate);
  }, [pvIndex, stepToIndex, applyFenUpdate]);

  const handlePlaybackBackward = useCallback(() => {
    stepToIndex(pvIndex - 1, applyFenUpdate);
  }, [pvIndex, stepToIndex, applyFenUpdate]);

  const handlePlaybackReset = useCallback(() => {
    stepToIndex(0, applyFenUpdate);
  }, [stepToIndex, applyFenUpdate]);

  const highlightMovesFromSquare = useCallback(
    (square: Square) => {
      const logicFen = transformFenForMovement(fen);
      const logicSquare = mapSquareForMovement(square);
      resetHighlights();
      highlightSquare(square, 'rgba(255, 214, 0, 0.35)');

      const chess = loadChess(logicFen);
      if (!chess) {
        const pseudoMoves = generatePseudoMoves(logicFen, logicSquare).map((move) => ({
          from: square,
          to: mapSquareForMovement(move.to),
          logicFrom: move.from,
          logicTo: move.to,
          promotion: move.promotion,
          isFree: move.isFree,
        }));
        pseudoMoves.forEach((move) => {
          highlightSquare(move.to, 'rgba(30, 136, 229, 0.35)');
        });
        selectedMoveFromRef.current = square;
        candidateMovesRef.current = pseudoMoves;
        return;
      }

      const moves = chess.moves({ square: logicSquare, verbose: true }) as Move[];
      moves.forEach((move) => {
        const uiTarget = mapSquareForMovement(move.to as Square);
        highlightSquare(uiTarget, 'rgba(30, 136, 229, 0.35)');
      });
      selectedMoveFromRef.current = square;
      candidateMovesRef.current = moves.map((move) => ({
        from: square,
        to: mapSquareForMovement(move.to as Square),
        logicFrom: move.from as Square,
        logicTo: move.to as Square,
        promotion: move.promotion,
      }));
    },
    [fen, highlightSquare, resetHighlights, mapSquareForMovement, transformFenForMovement]
  );

  const isBlackTurn = fen.split(' ')[1] === 'b';
  const boardSize = getBoardSize();
  const boardTransformStyle = useMemo(
    () => ({ transform: [{ rotate: isBoardFlipped ? '180deg' : '0deg' }] }),
    [isBoardFlipped],
  );
  const renderChessPiece = useRenderPiece(boardSize, isBoardFlipped);

  // --- HANDLERS ---

  const handleToggleTurn = (wantBlack: boolean) => {
    const currentIsBlack = fen.split(' ')[1] === 'b';
    if (wantBlack === currentIsBlack) return;
    clearAnalysisState();
    const newFen = FenUtils.toggleTurn(fen);
    applyFenUpdate(newFen);
  };

  const handleFlipDirection = () => {
    Alert.alert(
      isMovementReversed ? "Restore Piece Direction?" : "Flip Piece Direction?",
      "This toggles how moves are interpreted without moving the pieces. Use it if captures and pawn pushes go the wrong way.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isMovementReversed ? "Restore" : "Flip",
          onPress: () => {
            clearAnalysisState();
            clearMoveSelection();
            setIsMovementReversed((prev) => !prev);
          }
        }
      ]
    );
  };

  const handlePromotionSelect = useCallback(
    (pieceType: PieceSymbol) => {
      if (!promotionContext) {
        return;
      }
      executeCandidateMove(promotionContext.move, pieceType);
      setPromotionContext(null);
    },
    [executeCandidateMove, promotionContext],
  );

  const handlePromotionCancel = useCallback(() => {
    setPromotionContext(null);
    clearMoveSelection();
  }, [clearMoveSelection]);

  const handleSquarePress = useCallback(
    (square: Square) => {
      const selectedMoveFrom = selectedMoveFromRef.current;
      const candidateMoves = candidateMovesRef.current;

      if (selectedMoveFrom) {
        const move = candidateMoves.find((m) => m.to === square);
        if (move) {
          const promotionColor = getPromotionColor(move);
          if (promotionColor) {
            setPromotionContext({ move, color: promotionColor });
          } else {
            executeCandidateMove(move);
          }
          return;
        }

        if (selectedMoveFrom === square) {
          clearMoveSelection();
          return;
        }
      }

      const piece = FenUtils.getPieceAt(fen, square);
      if (piece) {
        highlightMovesFromSquare(square);
      } else if (selectedMoveFromRef.current) {
        clearMoveSelection();
      }
    },
    [
      fen,
      executeCandidateMove,
      highlightMovesFromSquare,
      clearMoveSelection,
      getPromotionColor,
      setPromotionContext,
    ]
  );

  const handleSquareLongPress = useCallback(
    (square: Square) => {
      clearMoveSelection();
      setSelectedSquare(square);
      setModalVisible(true);
    },
    [clearMoveSelection]
  );

  const handleSelectPiece = useCallback(
    (piece: { type: PieceSymbol; color: Color } | null) => {
      if (selectedSquare) {
        const newFen = FenUtils.updateSquare(fen, selectedSquare, piece);
        clearAnalysisState();
        applyFenUpdate(newFen);
      }
      clearMoveSelection();
      setModalVisible(false);
      setSelectedSquare(null);
    },
    [selectedSquare, fen, clearAnalysisState, applyFenUpdate, clearMoveSelection]
  );

  const handleAnalyze = useCallback(async () => {
    try {
      setIsAnalyzing(true);
      setAnalysisError(null);
      const baseFen = fen;
      const result = await analyzePosition(baseFen, { depth: 18, multipv: 1 });
      setAnalysisBaseFen(baseFen);
      setPvIndex(0);
      setAnalysisResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while analyzing the position.';
      setAnalysisResult(null);
      setAnalysisError(message);
      Alert.alert('Analysis failed', message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [fen, setAnalysisResult, setPvIndex]);

  const onMove = useCallback(
    (info: { state?: { fen?: string } }) => {
      const nextFen = info?.state?.fen;
      if (nextFen) {
        clearAnalysisState();
        clearMoveSelection();
        applyFenUpdate(nextFen);
      }
    },
    [applyFenUpdate, clearAnalysisState, clearMoveSelection]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Current Position"
          subtitle="Tap a piece to show moves, tap and hold to edit"
          onBack={() => navigation.goBack()}
          style={styles.header}
        />

        <View
          style={[
            styles.boardWrapper,
            { width: boardSize, height: boardSize },
            boardTransformStyle,
          ]}
        >
          <Chessboard
            ref={chessboardRef}
            fen={fen}
            onMove={onMove}
            boardSize={boardSize}
            renderPiece={renderChessPiece}
          />
          <View
            style={styles.boardOverlay}
            onLayout={(event) => {
              const { width: layoutWidth } = event.nativeEvent.layout;
              setOverlayPixels(layoutWidth);
            }}
          >
            {BOARD_SQUARE_ROWS.map((row, rowIndex) => (
              <OverlayRow
                key={`row-${rowIndex}`}
                squares={row}
                onSquarePress={handleSquarePress}
                onSquareLongPress={handleSquareLongPress}
              />
            ))}
            <BestMoveArrow
              from={arrowFrom}
              to={arrowTo}
              boardPixels={overlayPixels ?? boardSize}
            />
          </View>
        </View>

        <View style={styles.controlsContainer}>
        {/* Row 1: Side to Move toggle + View as White/Black toggle */}
        <View style={styles.buttonRow}>
          <View style={styles.flexOne}>
            <Text style={styles.toggleLabel}>Turn</Text>
            <SideToMoveToggle isBlackTurn={isBlackTurn} onChange={handleToggleTurn} />
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.toggleLabel}>Board</Text>
            <FlipToggle isFlipped={isBoardFlipped} onChange={setIsBoardFlipped} />
          </View>
        </View>

        {/* Row 2: Flip Piece Direction + Analyze */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.actionButton} onPress={handleFlipDirection}>
            <Text style={styles.buttonText}>
              {isMovementReversed ? '↩ Restore Direction' : '🔁 Flip Direction'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.analyzeButton, isAnalyzing && styles.analyzeButtonDisabled]}
            onPress={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[styles.buttonText, styles.analyzeText]}>🚀 Analyze</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Row 3: Save + Export + Challenge */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton]}
            onPress={handleSavePositionPress}
            disabled={savingPosition}>
            {savingPosition ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>💾 Save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.exportButton]}
            onPress={handleExportPosition}>
            <Text style={styles.buttonText}>↗ Export</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.challengeButton]}
            onPress={() => navigation.navigate('Friends', {challengeFen: fen})}>
            <Text style={styles.buttonText}>⚔️ Challenge</Text>
          </TouchableOpacity>
        </View>

        {/* Record Game — navigate to ScanGame with current position as starting FEN */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.recordButton]}
            onPress={() => navigation.navigate('ScanGame', {startingFen: fen})}>
            <Text style={styles.buttonText}>🎬 Record Game from This Position</Text>
          </TouchableOpacity>
        </View>

        {analysisError && (
          <View style={styles.analysisCard}>
            <Text style={styles.analysisErrorText}>{analysisError}</Text>
          </View>
        )}

        {isAnalyzing && !analysisResult && !analysisError && (
          <View style={styles.analysisCard}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.analysisInfoText}>Analyzing position...</Text>
          </View>
        )}

        <View style={[styles.analysisCard, { width: boardSize }]}>
          {primaryLine ? (
            <>
              <View style={styles.analysisLine}>
                <View style={styles.analysisLineHeader}>
                  <Text style={styles.analysisLineIndex}>#1</Text>
                  <Text style={styles.analysisMove}>{primaryLine.best_move_san || primaryLine.best_move}</Text>
                  <Text style={styles.analysisEval}>{formatEvaluation(primaryLine.evaluation)}</Text>
                </View>
                <Text style={styles.analysisPv} numberOfLines={2}>
                  {primaryLine.pv.join(' ')}
                </Text>
              </View>
              {playbackMoveCount > 0 && (
                <View style={styles.playbackControls}>
                  <TouchableOpacity
                    style={[styles.playbackButton, !canStepBackward && styles.playbackButtonDisabled]}
                    onPress={handlePlaybackBackward}
                    disabled={!canStepBackward}
                  >
                    <Text style={styles.playbackButtonText}>◀</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.playbackButton, !canResetPlayback && styles.playbackButtonDisabled]}
                    onPress={handlePlaybackReset}
                    disabled={!canResetPlayback}
                  >
                    <Text style={styles.playbackButtonText}>⟲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.playbackButton, !canStepForward && styles.playbackButtonDisabled]}
                    onPress={handlePlaybackForward}
                    disabled={!canStepForward}
                  >
                    <Text style={styles.playbackButtonText}>▶</Text>
                  </TouchableOpacity>
                </View>
              )}
              {playbackMoveCount > 0 && (
                <Text style={styles.playbackStatus}>Move {pvIndex} / {playbackMoveCount}</Text>
              )}
            </>
          ) : (
            <View style={styles.analysisPlaceholder}>
              <Text style={styles.analysisInfoText}>Press Analyze to see Stockfish's best line.</Text>
            </View>
          )}
        </View>
        </View>
      </ScrollView>

      <PieceSelectorModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={handleSelectPiece}
      />

      <PromotionModal
        visible={!!promotionContext}
        color={promotionContext?.color ?? 'w'}
        onSelect={handlePromotionSelect}
        onCancel={handlePromotionCancel}
      />

      <SaveTitleModal
        visible={saveModalVisible}
        defaultTitle={defaultPositionTitle}
        onSave={handleSavePositionConfirm}
        onCancel={() => setSaveModalVisible(false)}
      />

    </SafeAreaView>
  );
}