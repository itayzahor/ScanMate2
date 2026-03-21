import {useState, useMemo, useCallback} from 'react';
import {Chess, Square} from 'chess.js';
import type {AnalyzePositionResponse} from '../../services/api';

type PlaybackMove = {from: Square; to: Square; san: string; resultingFen?: string};
type PlaybackData = {states: string[]; moves: PlaybackMove[]};

export function useAnalysisPlayback(analysisBaseFen: string | null) {
  const [analysisResult, setAnalysisResult] = useState<AnalyzePositionResponse | null>(null);
  const [pvIndex, setPvIndex] = useState(0);

  const primaryLine = analysisResult?.lines?.[0] ?? null;

  const playbackData = useMemo<PlaybackData | null>(() => {
    if (!analysisBaseFen || !primaryLine) return null;
    const pvMoves = primaryLine.pv ?? [];
    const chess = new Chess(analysisBaseFen);
    const states: string[] = [analysisBaseFen];
    const moves: PlaybackMove[] = [];

    for (const san of pvMoves) {
      try {
        const move = chess.move(san);
        if (!move) break;
        moves.push({from: move.from as Square, to: move.to as Square, san, resultingFen: chess.fen()});
        states.push(chess.fen());
      } catch {
        break;
      }
    }
    return {states, moves};
  }, [analysisBaseFen, primaryLine]);

  const fallbackBestMove = useMemo(() => {
    const move = primaryLine?.best_move;
    if (!move || move.length < 4) return {from: null as Square | null, to: null as Square | null};
    return {from: move.slice(0, 2) as Square, to: move.slice(2, 4) as Square};
  }, [primaryLine]);

  const playbackMoveCount = playbackData?.moves.length ?? 0;
  const canStepForward = playbackMoveCount > 0 && pvIndex < playbackMoveCount;
  const canStepBackward = playbackMoveCount > 0 && pvIndex > 0;

  const upcomingMove = playbackData && pvIndex < playbackData.moves.length
    ? playbackData.moves[pvIndex]
    : null;

  const arrowFrom = upcomingMove?.from ?? fallbackBestMove.from;
  const arrowTo = upcomingMove?.to ?? fallbackBestMove.to;

  const stepToIndex = useCallback(
    (targetIndex: number, onStep?: (fen: string) => void) => {
      if (!playbackData) return;
      const maxIndex = playbackData.states.length - 1;
      const nextIndex = Math.min(Math.max(targetIndex, 0), maxIndex);
      if (nextIndex === pvIndex) return;
      setPvIndex(nextIndex);
      onStep?.(playbackData.states[nextIndex]);
    },
    [playbackData, pvIndex],
  );

  const resetPlayback = useCallback(() => {
    setAnalysisResult(null);
    setPvIndex(0);
  }, []);

  return {
    analysisResult,
    setAnalysisResult,
    primaryLine,
    pvIndex,
    setPvIndex,
    playbackData,
    playbackMoveCount,
    canStepForward,
    canStepBackward,
    upcomingMove,
    arrowFrom,
    arrowTo,
    fallbackBestMove,
    stepToIndex,
    resetPlayback,
  };
}
