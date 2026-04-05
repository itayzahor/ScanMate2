/**
 * Analysis.tsx — Interactive position editor and engine analysis screen.
 *
 * Responsibilities:
 *  - Renders an interactive chessboard for viewing / editing any FEN position.
 *  - Tap a piece → see legal (or pseudo-legal) moves; tap a target → execute.
 *  - Long-press a square → place / remove a piece via PieceSelectorModal.
 *  - Toggle side-to-move, flip the board view, and reverse movement direction.
 *  - Request Stockfish analysis and step through the best line move-by-move.
 *  - Save positions to library, export to Lichess, challenge friends, or start
 *    recording a full game from the current position.
 */

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
import { BestMoveArrow } from '../../ui/components/BestMoveArrow';
import { useAnalysisPlayback } from '../../shared/hooks/useAnalysisPlayback';
import { useRenderPiece } from '../../shared/hooks/useRenderPiece';
import { BOARD_SQUARE_ROWS } from '../../shared/constants/board';
import { reverseSquare } from '../../shared/utils/board';
import {
  loadChess,
  generatePseudoMoves,
  FenUtils,
  formatEvaluation,
} from '../../shared/utils/fenEditor';

// ── Types ────────────────────────────────────────────────────────────

/** A candidate move the user can select after tapping a piece on the board. */
type CandidateMove = {
  from: Square;      // UI square (may differ from logic when movement is reversed)
  to: Square;        // UI target square
  logicFrom: Square; // Source square in FEN coordinate space
  logicTo: Square;   // Target square in FEN coordinate space
  promotion?: PieceSymbol;
  isFree?: boolean;  // True when the position is invalid — moves bypass legality
};

// ── Main Screen ──────────────────────────────────────────────────────

type AnalysisScreenProps = NativeStackScreenProps<RootStackParamList, 'Analysis'>;

/**
 * Position editor and engine analysis screen.
 *
 * Accepts a FEN string via `route.params.fen` (defaults to the standard
 * starting position). Supports both legal moves (via chess.js) and "free"
 * pseudo-moves when the position is invalid (e.g. missing kings).
 */
export default function AnalysisScreen({ route, navigation }: AnalysisScreenProps) {
  const initialFen = normalizeFen(route.params?.fen ?? STARTING_FEN);

  // ── Board state ─────────────────────────────────────────────────────
  const [fen, setFen] = useState<string>(initialFen);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [overlayPixels, setOverlayPixels] = useState<number | null>(null);
  const [isBoardFlipped, setIsBoardFlipped] = useState(false);
  /** When true, piece direction is mirrored (useful for boards photographed from the black side). */
  const [isMovementReversed, setIsMovementReversed] = useState(false);
  const [promotionContext, setPromotionContext] = useState<{ move: CandidateMove; color: Color } | null>(null);
  const chessboardRef = useRef<ChessboardRef>(null);
  const navigationFen = route.params?.fen;
  /** Tracks which square the user tapped to begin a move (null when idle). */
  const selectedMoveFromRef = useRef<Square | null>(null);
  /** Legal/pseudo-legal destinations from the currently selected square. */
  const candidateMovesRef = useRef<CandidateMove[]>([]);

  // ── Engine analysis state ───────────────────────────────────────────
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  /** The FEN that was sent to the engine — used by playback to rewind. */
  const [analysisBaseFen, setAnalysisBaseFen] = useState<string | null>(null);

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

  // ── Save & Export ───────────────────────────────────────────────────
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

  /** Builds a Lichess analysis URL from the current FEN and opens it in the browser. */
  const handleExportPosition = useCallback(() => {
    // The board part (index 0) stays as-is; remaining FEN fields are URI-encoded
    const encoded = fen.split(' ').map((part, i) => i === 0 ? part : encodeURIComponent(part)).join(' ');
    const url = `https://lichess.org/analysis/${encoded}`;
    Linking.openURL(url);
  }, [fen]);

  // ── Movement mapping helpers ────────────────────────────────────────
  // When the board is "reversed" (black at bottom), FEN coordinates
  // need mirroring so taps map to the correct logical squares.

  /** Mirrors FEN placement rows when movement is reversed; identity otherwise. */
  const transformFenForMovement = useCallback(
    (value: string) => (isMovementReversed ? FenUtils.reverseFen(value) : value),
    [isMovementReversed],
  );

  /** Maps a UI square to its logical FEN square (accounts for reversal). */
  const mapSquareForMovement = useCallback(
    (square: Square) => (isMovementReversed ? reverseSquare(square) : square),
    [isMovementReversed],
  );

  /** Returns the pawn's color if the move is a promotion, null otherwise. */
  const getPromotionColor = useCallback(
    (move: CandidateMove): Color | null => {
      const movingPiece = FenUtils.getPieceAt(fen, move.from);
      if (!movingPiece || movingPiece.type !== 'p') {
        return null;
      }
      const targetRank = Number(move.to[1]);
      // Promotion ranks swap when the board movement is reversed
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

  // ── Low-level board helpers ─────────────────────────────────────────

  /** Schedules a callback on the next animation frame (or setTimeout fallback). */
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

  /** Normalizes and applies a new FEN to both React state and the chessboard widget. */
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

  /**
   * Executes a candidate move on the board.
   * Uses chess.js for legal positions; falls back to free-move for invalid ones.
   */
  const executeCandidateMove = useCallback(
    (move: CandidateMove, promotionOverride?: PieceSymbol) => {
      const resolvedPromotion = promotionOverride ?? move.promotion;

      // Invalid positions can't use chess.js — move the piece freely instead
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

      // Legal position — attempt the move through chess.js validation
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

  // ── Effects ─────────────────────────────────────────────────────────

  /** Clear move highlights whenever the FEN changes. */
  useEffect(() => {
    clearMoveSelection();
  }, [fen, clearMoveSelection]);

  /** Sync board when navigation params push a new FEN. */
  useEffect(() => {
    if (!navigationFen) {
      return;
    }
    const normalized = normalizeFen(navigationFen);
    clearAnalysisState();
    applyFenUpdate(normalized);
  }, [navigationFen, clearAnalysisState, applyFenUpdate]);

  // ── Playback controls ──────────────────────────────────────────────

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

  /**
   * Highlights legal (or pseudo-legal) destination squares for a tapped piece.
   * Stores the resulting candidates in `candidateMovesRef` for the next tap.
   */
  const highlightMovesFromSquare = useCallback(
    (square: Square) => {
      const logicFen = transformFenForMovement(fen);
      const logicSquare = mapSquareForMovement(square);
      resetHighlights();
      // Highlight the tapped piece's square in gold
      highlightSquare(square, 'rgba(255, 214, 0, 0.35)');

      // If chess.js can't load the FEN (invalid position),
      // fall back to pseudo-legal moves so pieces are still movable
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

      // Valid position — get fully legal moves from chess.js
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

  // ── User interaction handlers ───────────────────────────────────────

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

  /**
   * Tap handler for the transparent square overlay.
   * - If a piece is already selected and the tapped square is a valid target → execute move.
   * - If tapping the same piece again → deselect.
   * - Otherwise → select the tapped piece and highlight its moves.
   */
  const handleSquarePress = useCallback(
    (square: Square) => {
      const selectedMoveFrom = selectedMoveFromRef.current;
      const candidateMoves = candidateMovesRef.current;

      // A piece is already selected — check if the tapped square is a valid target
      if (selectedMoveFrom) {
        const move = candidateMoves.find((m) => m.to === square);
        if (move) {
          // If this move triggers promotion, show the modal; otherwise execute
          const promotionColor = getPromotionColor(move);
          if (promotionColor) {
            setPromotionContext({ move, color: promotionColor });
          } else {
            executeCandidateMove(move);
          }
          return;
        }

        // Tapped the same piece again — deselect
        if (selectedMoveFrom === square) {
          clearMoveSelection();
          return;
        }
      }

      // No piece selected — tap a piece to start selection, or tap empty to clear
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

  /** Long-press opens the piece selector modal for placing / removing pieces. */
  const handleSquareLongPress = useCallback(
    (square: Square) => {
      clearMoveSelection();
      setSelectedSquare(square);
      setModalVisible(true);
    },
    [clearMoveSelection]
  );

  /** Places or removes a piece on the selected square (from PieceSelectorModal). */
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

  /** Sends the current FEN to the ML server for Stockfish analysis. */
  const handleAnalyze = useCallback(async () => {
    try {
      setIsAnalyzing(true);
      setAnalysisError(null);
      // Snapshot the FEN so playback can rewind to this exact position
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

  /** Callback from the Chessboard widget when a drag-and-drop move completes. */
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

  // ── Render ──────────────────────────────────────────────────────────

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
        {/* Chessboard widget — handles drag-and-drop moves natively */}
          <Chessboard
            ref={chessboardRef}
            fen={fen}
            onMove={onMove}
            boardSize={boardSize}
            renderPiece={renderChessPiece}
          />
          {/* Transparent overlay captures taps/long-presses on individual squares */}
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
              boardSize={overlayPixels ?? boardSize}
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
            <Text style={styles.buttonText}>↗ Lichess</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.challengeButton]}
            onPress={() => {
              if (!user) {
                Alert.alert('Sign In Required', 'Please sign in from the home screen to challenge friends.');
                return;
              }
              navigation.navigate('Friends', {challengeFen: fen});
            }}>
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

        {/* ── Analysis result card ──────────────────────────────────── */}
        <View style={[styles.analysisCard, { width: boardSize }]}>
          {primaryLine ? (
            <>
              {/* Best line header: move index, SAN notation, evaluation score */}
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
              {/* Step-through controls: ◀ back, ⟲ reset, ▶ forward */}
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

      {/* ── Modals ───────────────────────────────────────────────────── */}

      {/* Place/remove any piece on a long-pressed square */}
      <PieceSelectorModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={handleSelectPiece}
      />

      {/* Choose promotion piece (queen/rook/bishop/knight) */}
      <PromotionModal
        visible={!!promotionContext}
        color={promotionContext?.color ?? 'w'}
        onSelect={handlePromotionSelect}
        onCancel={handlePromotionCancel}
      />

      {/* Title input dialog shown before saving a position to the library */}
      <SaveTitleModal
        visible={saveModalVisible}
        defaultTitle={defaultPositionTitle}
        onSave={handleSavePositionConfirm}
        onCancel={() => setSaveModalVisible(false)}
      />

    </SafeAreaView>
  );
}