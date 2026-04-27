import {useState, useMemo, useCallback} from 'react';
import {Chess, Square} from 'chess.js';
import type {AnalyzePositionResponse} from '../../services/api';

/**
 * A single move within a PV playback sequence.
 * Stores the source/destination squares, SAN notation, and the resulting FEN after the move.
 */
type PlaybackMove = {from: Square; to: Square; san: string; resultingFen?: string};

/**
 * The full precomputed playback sequence for a PV line.
 * - `states`: array of FEN strings; index 0 is the base position, index N is after move N.
 * - `moves`: array of moves parallel to `states` (move[i] leads from states[i] to states[i+1]).
 */
type PlaybackData = {states: string[]; moves: PlaybackMove[]};

/**
 * `useAnalysisPlayback` manages step-by-step playback of a chess engine's
 * principal variation (PV) line on top of a given board position.
 *
 * Responsibilities:
 * - Stores the raw engine analysis result and exposes a setter for the caller to populate it.
 * - Precomputes the sequence of FEN states and move objects for the best PV line.
 * - Tracks the current playback index (`pvIndex`) within that sequence.
 * - Derives navigation flags (`canStepForward`, `canStepBackward`) and the next-move arrow.
 * - Falls back to the engine's `best_move` string for the arrow when no PV is available.
 * - Exposes `stepToIndex` and `resetPlayback` for controlled navigation.
 *
 * @param analysisBaseFen - The FEN string of the position being analyzed, or null when none.
 * @returns A set of state values, derived data, and control callbacks (see return object).
 */
export function useAnalysisPlayback(analysisBaseFen: string | null) {
  // Holds the full analysis response returned by the engine API.
  const [analysisResult, setAnalysisResult] = useState<AnalyzePositionResponse | null>(null);

  // Current position within the PV playback sequence (0 = base position, N = after N moves).
  const [pvIndex, setPvIndex] = useState(0);

  // Convenience alias: the first (highest-ranked) line from the analysis result.
  const primaryLine = analysisResult?.lines?.[0] ?? null;

  /**
   * Precomputes the full playback sequence for the primary PV line.
   * Starting from `analysisBaseFen`, each SAN move in `primaryLine.pv` is applied
   * using chess.js. The loop stops early on any illegal or unparseable move.
   * Returns null when there is no base FEN or no analysis line available yet.
   */
  const playbackData = useMemo<PlaybackData | null>(() => {
    if (!analysisBaseFen || !primaryLine) return null;
    const pvMoves = primaryLine.pv ?? [];
    const chess = new Chess(analysisBaseFen);

    // Index 0 is always the base position before any PV move is played.
    const states: string[] = [analysisBaseFen];
    const moves: PlaybackMove[] = [];

    for (const san of pvMoves) {
      try {
        const move = chess.move(san);
        if (!move) break; // chess.js returns null for illegal moves
        moves.push({from: move.from as Square, to: move.to as Square, san, resultingFen: chess.fen()});
        states.push(chess.fen());
      } catch {
        break; // Stop on any unexpected parsing error
      }
    }
    return {states, moves};
  }, [analysisBaseFen, primaryLine]);

  /**
   * Parses the engine's `best_move` UCI string (e.g. "e2e4") into from/to squares.
   * Used as a fallback arrow when no PV playback data exists or the user hasn't
   * stepped into the line yet.
   * Returns `{from: null, to: null}` when the move string is absent or malformed.
   */
  const fallbackBestMove = useMemo(() => {
    const move = primaryLine?.best_move;
    if (!move || move.length < 4) return {from: null as Square | null, to: null as Square | null};
    return {from: move.slice(0, 2) as Square, to: move.slice(2, 4) as Square};
  }, [primaryLine]);

  // Total number of moves in the current PV sequence (0 when no data).
  const playbackMoveCount = playbackData?.moves.length ?? 0;

  // True when there is a next move to step into.
  const canStepForward = playbackMoveCount > 0 && pvIndex < playbackMoveCount;

  // True when we have stepped at least one move in and can go back.
  const canStepBackward = playbackMoveCount > 0 && pvIndex > 0;

  // The move that will be executed on the next "step forward" action, or null at the end.
  const upcomingMove = playbackData && pvIndex < playbackData.moves.length
    ? playbackData.moves[pvIndex]
    : null;

  // Arrow hint squares: prefer the upcoming move's squares; fall back to the engine's best_move.
  const arrowFrom = upcomingMove?.from ?? fallbackBestMove.from;
  const arrowTo = upcomingMove?.to ?? fallbackBestMove.to;

  /**
   * Navigates the playback to an arbitrary index within the PV sequence.
   * Clamps `targetIndex` to the valid range [0, states.length - 1].
   * Calls the optional `onStep` callback with the FEN at the new index,
   * allowing the caller to sync the board display.
   *
   * @param targetIndex - The desired playback position index.
   * @param onStep - Optional callback receiving the FEN string at the new index.
   */
  const stepToIndex = useCallback(
    (targetIndex: number, onStep?: (fen: string) => void) => {
      if (!playbackData) return;
      const maxIndex = playbackData.states.length - 1;
      const nextIndex = Math.min(Math.max(targetIndex, 0), maxIndex);
      if (nextIndex === pvIndex) return; // No-op if already at the target index
      setPvIndex(nextIndex);
      onStep?.(playbackData.states[nextIndex]);
    },
    [playbackData, pvIndex],
  );

  /**
   * Clears the current analysis result and resets the playback index to 0.
   * Call this when the user scans a new position or dismisses the analysis panel.
   */
  const resetPlayback = useCallback(() => {
    setAnalysisResult(null);
    setPvIndex(0);
  }, []);

  return {
    /** The raw engine analysis response; set via `setAnalysisResult`. */
    analysisResult,
    /** Setter to populate the analysis result (e.g. after an API call completes). */
    setAnalysisResult,
    /** The first/best line from the analysis result, or null. */
    primaryLine,
    /** Current step index within the PV sequence (0 = base position). */
    pvIndex,
    /** Direct setter for pvIndex (use `stepToIndex` for callback support). */
    setPvIndex,
    /** Precomputed states + moves for the PV line, or null if unavailable. */
    playbackData,
    /** Number of moves in the PV sequence. */
    playbackMoveCount,
    /** Whether stepping forward is possible. */
    canStepForward,
    /** Whether stepping backward is possible. */
    canStepBackward,
    /** The next move in the sequence (shown as a preview arrow), or null. */
    upcomingMove,
    /** Source square for the board arrow hint. */
    arrowFrom,
    /** Destination square for the board arrow hint. */
    arrowTo,
    /** Parsed best_move squares used as arrow fallback when no PV data exists. */
    fallbackBestMove,
    /** Navigate to a specific index, optionally syncing the board via callback. */
    stepToIndex,
    /** Reset analysis result and playback index to initial state. */
    resetPlayback,
  };
}
