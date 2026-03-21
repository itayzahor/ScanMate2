import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chess } from 'chess.js';

import { styles, localStyles } from '../../ui/styles/ScanBoard.styles';
import type { RootStackParamList } from '../../shared/types/navigation';
import { ScreenHeader } from '../../ui/components/ScreenHeader';
import { getBoardSize, HEADER_HEIGHT } from '../../shared/constants/layout';
import { startGame, sendGameFrame, endGame, discardGame, getGameStatus, checkBoardCorners } from '../../services/api';
import { cropFrameToBoard } from '../../shared/utils/cropFrame';
import type { GameSnapshot } from '../../shared/types/game';
import { STARTING_FEN, STARTING_BOARD_FEN, normalizeFen } from '../../shared/utils/fen';

const BOARD_TOP_GAP = 24;
const CAPTURE_INTERVAL_MS = 125;
const BURST_INTERVAL_MS = 40;
const BURST_COUNT = 5;
const RECORD_TIPS = [
  'Mount the phone so the board stays centered',
  'Keep hands outside the green frame between moves',
  'Pause recording any time play stops',
];

type ScanGameProps = NativeStackScreenProps<RootStackParamList, 'ScanGame'>;

type CaptureState = 'idle' | 'recording' | 'processing';

function movesToSnapshots(moves: string[], fen: string): GameSnapshot[] {
  const chess = new Chess(normalizeFen(fen));
  const snapshots: GameSnapshot[] = [{ fen: chess.fen(), timestamp: Date.now() }];
  for (const san of moves) {
    chess.move(san);
    snapshots.push({ fen: chess.fen(), timestamp: Date.now() });
  }
  return snapshots;
}

export const ScanGame = ({ navigation, route }: ScanGameProps) => {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const isScreenFocused = useIsFocused();
  const boardSize = getBoardSize();
  const windowDimensions = Dimensions.get('window');
  const windowWidth = windowDimensions.width;
  const windowHeight = windowDimensions.height;
  const overlayTopPx = HEADER_HEIGHT + BOARD_TOP_GAP;
  const boardOffsetX = (windowWidth - boardSize) / 2;

  const customFen = route.params?.startingFen;
  const boardFen = customFen ? customFen.split(' ')[0] : STARTING_BOARD_FEN;

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const captureStateRef = useRef<CaptureState>('idle');
  const [boardDetected, setBoardDetected] = useState(false);
  const checkActiveRef = useRef(true);
  const mountedRef = useRef(true);
  const [frameCount, setFrameCount] = useState(0);
  const [progress, setProgress] = useState<{ enqueued: number; processed: number } | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const startingFenRef = useRef<string>(STARTING_FEN);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);
  const burstRef = useRef(BURST_COUNT);
  const sentCountRef = useRef(0);

  const setCaptureStateSafe = useCallback((next: CaptureState) => {
    captureStateRef.current = next;
    setCaptureState(next);
  }, []);

  const format = useCameraFormat(device, [
    { photoResolution: 'max' },
    { fps: 30 },
  ]);
  const isActive = isScreenFocused;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishGame = useCallback(async (navigateToReview: boolean) => {
    clearTimer();
    const gameId = gameIdRef.current;
    if (!gameId) {
      setCaptureStateSafe('idle');
      return;
    }

    try {
      setCaptureStateSafe('processing');
      setProgress(null);

      // Poll progress while endGame awaits server drain.
      let pollStopped = false;
      const pollId = setInterval(async () => {
        if (pollStopped) return;
        try {
          const s = await getGameStatus(gameId);
          setProgress({ enqueued: s.enqueued, processed: s.processed });
        } catch {
          // Game already ended on the server — stop polling.
          pollStopped = true;
          clearInterval(pollId);
        }
      }, 400);

      const result = await endGame(gameId);
      pollStopped = true;
      clearInterval(pollId);

      console.log('[ScanGame] endGame result:', JSON.stringify(result));
      gameIdRef.current = null;
      setCaptureStateSafe('idle');
      setProgress(null);

      if (navigateToReview && result.moves.length > 0) {
        const snapshots = movesToSnapshots(result.moves, startingFenRef.current);
        navigation.navigate('GameReview', { snapshots, moves: result.moves });
      } else if (navigateToReview) {
        Alert.alert('No moves detected', 'The server could not detect any moves in the recording.');
      }
    } catch (error) {
      console.error('[ScanGame] endGame failed', error);
      gameIdRef.current = null;
      setCaptureStateSafe('idle');
      setProgress(null);
    }
  }, [clearTimer, navigation, setCaptureStateSafe]);

  const cancelGame = useCallback(async () => {
    clearTimer();
    const gameId = gameIdRef.current;
    if (gameId) {
      try { await discardGame(gameId); } catch {}
      gameIdRef.current = null;
    }
    setCaptureStateSafe('idle');
    setFrameCount(0);
  }, [clearTimer, setCaptureStateSafe]);

  // --- Board check loop (RTT-paced, idle only) ---
  const runBoardCheck = useCallback(async () => {
    while (checkActiveRef.current && mountedRef.current) {
      try {
        if (!cameraRef.current || captureStateRef.current !== 'idle') {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        const snap = await cameraRef.current.takeSnapshot({ quality: 50 });
        if (!snap.width || !snap.height) { continue; }

        const cropped = await cropFrameToBoard({
          photoPath: snap.path,
          photoWidth: snap.width,
          photoHeight: snap.height,
          windowWidth,
          windowHeight,
          boardSize,
          boardOffsetX,
          overlayTopPx,
        });

        const detected = await checkBoardCorners(cropped);
        if (mountedRef.current) { setBoardDetected(detected); }
      } catch {
        // Camera not ready or transient error
      }
    }
  }, [boardOffsetX, boardSize, overlayTopPx, windowHeight, windowWidth]);

  useEffect(() => {
    mountedRef.current = true;
    checkActiveRef.current = true;
    runBoardCheck();
    return () => {
      mountedRef.current = false;
      checkActiveRef.current = false;
    };
  }, [runBoardCheck]);

  // --- Live Recording ---

  const captureFrame = useCallback(async () => {
    // Schedule next tick immediately so cadence stays ~125ms regardless of capture time.
    if (captureStateRef.current === 'recording') {
      clearTimer();
      if (burstRef.current > 0) { burstRef.current--; }
      const delay = burstRef.current > 0 ? BURST_INTERVAL_MS : CAPTURE_INTERVAL_MS;
      timerRef.current = setTimeout(() => captureFrame(), delay);
    }

    if (!cameraRef.current || isProcessingRef.current) {
      return;
    }
    if (captureStateRef.current !== 'recording') {
      clearTimer();
      return;
    }

    isProcessingRef.current = true;
    try {
      const photo = await cameraRef.current.takeSnapshot({ quality: 85 });
      if (!photo.width || !photo.height) {
        throw new Error('Snapshot missing size info');
      }

      const resizedPath = await cropFrameToBoard({
        photoPath: photo.path,
        photoWidth: photo.width,
        photoHeight: photo.height,
        windowWidth,
        windowHeight,
        boardSize,
        boardOffsetX,
        overlayTopPx,
      });
      const gameId = gameIdRef.current;
      if (!gameId || captureStateRef.current !== 'recording') {
        return;
      }

      // Fire-and-forget upload — count locally, don't wait for response
      sentCountRef.current++;
      setFrameCount(sentCountRef.current);
      sendGameFrame(gameId, resizedPath).catch(error => {
        console.error('[ScanGame] Upload error', error);
      });
    } catch (error) {
      console.error('[ScanGame] Capture loop error', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, [boardOffsetX, boardSize, clearTimer, overlayTopPx, windowHeight, windowWidth]);

  const handleRecordToggle = useCallback(async () => {
    if (captureState === 'recording') {
      await finishGame(true);
      return;
    }
    if (captureState !== 'idle') {
      return;
    }

    try {
      setFrameCount(0);
      sentCountRef.current = 0;
      burstRef.current = BURST_COUNT;
      startingFenRef.current = customFen ?? STARTING_FEN;
      const result = await startGame(boardFen);
      gameIdRef.current = result.game_id;
      setCaptureStateSafe('recording');
      captureFrame();
    } catch (error) {
      console.error('[ScanGame] startGame failed', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to start game session');
    }
  }, [captureState, captureFrame, finishGame, setCaptureStateSafe, boardFen, customFen]);

  // --- Cleanup ---

  useEffect(() => {
    return () => {
      clearTimer();
      const gameId = gameIdRef.current;
      if (gameId) {
        discardGame(gameId).catch(() => {});
        gameIdRef.current = null;
      }
    };
  }, [clearTimer]);

  if (device == null) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No camera device found.</Text>
      </View>
    );
  }

  const isRecording = captureState === 'recording';
  const isProcessing = captureState === 'processing';
  const isIdle = captureState === 'idle';

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        format={format}
        photo
        resizeMode="cover"
      />

      <View style={styles.viewfinderContainer}>
        <View style={[styles.viewfinderTopMask, { height: overlayTopPx }]} />
        <View style={styles.viewfinderMiddleRow}>
          <View style={styles.viewfinderSideMask} />
          <View style={[styles.viewfinderGuide, !isRecording && {borderColor: boardDetected ? styles.boardDetectedBorder.borderColor : styles.boardNotDetectedBorder.borderColor}]} />
          <View style={styles.viewfinderSideMask} />
        </View>
        <View style={styles.viewfinderBottomMask} />
      </View>

      <View style={styles.overlayControls}>
        <View style={styles.instructionBox}>
          <ScreenHeader
            title="Record Game"
            subtitle="Point your camera at the board and press Record."
            onBack={() => {
              if (isRecording || isProcessing) {
                cancelGame();
              }
              navigation.goBack();
            }}
            style={styles.screenHeader}
          />
        </View>

        <View style={styles.viewfinderSpacer} />

        {isIdle && (
          <Text style={[styles.boardStatusText, {color: boardDetected ? styles.boardDetectedBorder.borderColor : styles.boardNotDetectedBorder.borderColor}]}>
            {boardDetected ? '✓ BOARD DETECTED' : '✗ NO BOARD DETECTED'}
          </Text>
        )}

        {isIdle && (
          <View style={[styles.tipsList, { width: boardSize }]}>
            {customFen && (
              <Text style={[styles.tipText, styles.customFenTip]}>
                ♟ Custom starting position set
              </Text>
            )}
            {RECORD_TIPS.map((tip) => (
              <Text key={tip} style={styles.tipText}>
                {`• ${tip}`}
              </Text>
            ))}
          </View>
        )}

        {isRecording && (
          <View style={localStyles.statusBar}>
            <Text style={localStyles.statusText}>
              {frameCount > 0
                ? `${frameCount} frame${frameCount !== 1 ? 's' : ''} captured`
                : 'Watching for moves…'}
            </Text>
          </View>
        )}

        {isProcessing && (
          <View style={localStyles.processingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={localStyles.processingTitle}>Processing frames…</Text>
            {progress && progress.enqueued > 0 && (
              <>
                <View style={localStyles.progressBarTrack}>
                  <View
                    style={[
                      localStyles.progressBarFill,
                      { width: `${Math.round((progress.processed / progress.enqueued) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={localStyles.processingDetail}>
                  {progress.processed} / {progress.enqueued} frames ({Math.round((progress.processed / progress.enqueued) * 100)}%)
                </Text>
              </>
            )}
          </View>
        )}

        <View style={styles.captureButtonContainer}>
          {!isProcessing && (
            <View style={styles.captureButtonGroup}>
              <TouchableOpacity
                style={[styles.captureButton, isRecording && localStyles.recordingButton]}
                onPress={handleRecordToggle}
              >
                <Text style={styles.buttonText}>{isRecording ? 'Stop' : 'Record'}</Text>
              </TouchableOpacity>
              {isIdle && (
                <TouchableOpacity
                  style={localStyles.setPositionButton}
                  onPress={() => navigation.navigate('Analysis', { fen: customFen ?? STARTING_FEN })}
                >
                  <Text style={localStyles.setPositionText}>
                    {customFen ? '✏️ Edit Start Position' : '♟ Set Start Position'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

