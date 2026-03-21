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
import ImageEditor from '@react-native-community/image-editor';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chess } from 'chess.js';

import { styles } from '../../ui/styles/ScanBoard.styles';
import type { RootStackParamList } from '../../../App';
import { ScreenHeader } from '../../ui/components/ScreenHeader';
import { getBoardSize, HEADER_HEIGHT } from '../../shared/constants/layout';
import { startGame, sendGameFrame, endGame, discardGame, getGameStatus } from '../../services/api';
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
      const pollId = setInterval(async () => {
        try {
          const s = await getGameStatus(gameId);
          setProgress({ enqueued: s.enqueued, processed: s.processed });
        } catch { /* game may already be gone */ }
      }, 400);

      const result = await endGame(gameId);
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
      const photoPath = photo.path;
      const photoUri = photoPath.startsWith('file://') ? photoPath : `file://${photoPath}`;

      const actualWidth = photo.width;
      const actualHeight = photo.height;
      if (!actualWidth || !actualHeight) {
        throw new Error('Snapshot missing size info');
      }

      const displayScale = Math.max(windowWidth / actualWidth, windowHeight / actualHeight);
      const boardPixelWidth = Math.floor(boardSize / displayScale);
      const squareSize = Math.min(boardPixelWidth, actualWidth, actualHeight);
      const horizontalOverflow = Math.max(actualWidth * displayScale - windowWidth, 0) / 2;
      const verticalOverflow = Math.max(actualHeight * displayScale - windowHeight, 0) / 2;

      let offsetX = Math.floor((boardOffsetX + horizontalOverflow) / displayScale);
      offsetX = Math.max(0, Math.min(offsetX, actualWidth - squareSize));
      let offsetY = Math.floor((overlayTopPx + verticalOverflow) / displayScale);
      offsetY = Math.max(0, Math.min(offsetY, actualHeight - squareSize));

      const croppedResult = await ImageEditor.cropImage(photoUri, {
        offset: { x: offsetX, y: offsetY },
        size: { width: squareSize, height: squareSize },
        displaySize: { width: 640, height: 640 },
        resizeMode: 'contain' as const,
      });

      const resizedPath = croppedResult.uri.replace('file://', '');
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
          <View style={styles.viewfinderGuide} />
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
          <View style={[styles.tipsList, { width: boardSize }]}>
            {customFen && (
              <Text style={[styles.tipText, { color: '#4fc3f7', marginBottom: 4 }]}>
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
            <View style={{ alignItems: 'center', gap: 10 }}>
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

const localStyles = StyleSheet.create({
  recordingButton: {
    backgroundColor: '#c0392b',
    borderColor: '#fff',
  },
  statusBar: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    marginTop: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
  },
  setPositionButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  setPositionText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    zIndex: 10,
  },
  processingTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  processingDetail: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  progressBarTrack: {
    width: '60%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#4fc3f7',
  },
});
