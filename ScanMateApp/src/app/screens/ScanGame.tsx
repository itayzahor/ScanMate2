/**
 * ScanGame.tsx — Live game recording screen.
 *
 * Responsibilities:
 *  - Opens the rear camera with the same viewfinder overlay as ScanBoard.
 *  - On "Record", starts a server-side game session and begins a
 *    capture loop that takes snapshots every ~125 ms (with a short
 *    burst of rapid frames at the start) and uploads them to the ML
 *    server for move detection.
 *  - On "Stop", finalises the game on the server, receives the
 *    detected move list, replays them into a chess.js instance to
 *    build GameSnapshot[], and navigates to GameReview.
 *  - Supports an optional custom starting FEN passed via route params.
 */

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
import KeepAwake from 'react-native-keep-awake';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chess } from 'chess.js';

import { styles, localStyles } from '../../ui/styles/ScanBoard.styles';
import type { RootStackParamList } from '../../shared/types/navigation';
import { ScreenHeader } from '../../ui/components/ScreenHeader';
import { getBoardSize, HEADER_HEIGHT } from '../../shared/constants/layout';
import { startGame, sendGameFrame, endGame, discardGame, checkBoardCorners } from '../../services/api';
import { cropFrameToBoard } from '../../shared/utils/cropFrame';
import type { GameSnapshot } from '../../shared/types/game';
import { STARTING_FEN, STARTING_BOARD_FEN, normalizeFen } from '../../shared/utils/fen';

// ── Constants ────────────────────────────────────────────────────────

/** Vertical gap between the header and the viewfinder square. */
const BOARD_TOP_GAP = 24;
/** Milliseconds between regular frame captures. */
const CAPTURE_INTERVAL_MS = 125;
/** Milliseconds between frames during the initial burst (faster to capture the initial position). */
const BURST_INTERVAL_MS = 40;
/** Number of rapid frames fired at the start of recording. */
const BURST_COUNT = 5;

const RECORD_TIPS = [
  'Mount the phone so the board stays centered',
  'Keep hands outside the green frame between moves',
  'Pause recording any time play stops',
];

// ── Types ────────────────────────────────────────────────────────────

type ScanGameProps = NativeStackScreenProps<RootStackParamList, 'ScanGame'>;

/** Tri-state capturing lifecycle: idle → recording → processing → idle. */
type CaptureState = 'idle' | 'recording' | 'processing';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Replays a SAN move list from a given FEN and returns a GameSnapshot
 * for each position (including the starting one) so the GameReview
 * screen can step through the game.
 */
function movesToSnapshots(moves: string[], fen: string): GameSnapshot[] {
  const chess = new Chess(normalizeFen(fen));
  const snapshots: GameSnapshot[] = [{ fen: chess.fen(), timestamp: Date.now() }];
  for (const san of moves) {
    chess.move(san);
    snapshots.push({ fen: chess.fen(), timestamp: Date.now() });
  }
  return snapshots;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * Full-screen camera recorder that streams board snapshots to the ML
 * server for real-time move detection.
 *
 * Reuses the ScanBoard viewfinder and mask styles. The capture loop
 * fires at ~8 fps (125 ms) with a short initial burst of 5 frames at
 * 25 fps to quickly lock the starting position.
 */
export const ScanGame = ({ navigation, route }: ScanGameProps) => {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const isScreenFocused = useIsFocused();

  // ── Layout calculations ───────────────────────────────────────────
  const boardSize = getBoardSize();
  const windowDimensions = Dimensions.get('window');
  const windowWidth = windowDimensions.width;
  const windowHeight = windowDimensions.height;
  /** Y offset (px) where the viewfinder square starts. */
  const overlayTopPx = HEADER_HEIGHT + BOARD_TOP_GAP;
  /** X offset (px) to horizontally center the viewfinder. */
  const boardOffsetX = (windowWidth - boardSize) / 2;

  // ── Route params ──────────────────────────────────────────────────
  /** Optional custom starting FEN passed from Analysis or another screen. */
  const customFen = route.params?.startingFen;
  /** Board-only portion of the FEN (no move counters) sent to startGame. */
  const boardFen = customFen ? customFen.split(' ')[0] : STARTING_BOARD_FEN;

  // ── State ─────────────────────────────────────────────────────────
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  /** Mirror of captureState accessible inside async loops without stale closure. */
  const captureStateRef = useRef<CaptureState>('idle');
  const [boardDetected, setBoardDetected] = useState(false);
  /** Controls the idle-only board-detection loop. */
  const checkActiveRef = useRef(true);
  const mountedRef = useRef(true);
  /** Number of frames uploaded (displayed in the recording status bar). */
  const [frameCount, setFrameCount] = useState(0);
  /** Server-assigned game session ID. */
  const gameIdRef = useRef<string | null>(null);
  const startingFenRef = useRef<string>(STARTING_FEN);
  /** Handle for the next scheduled capture timeout. */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guard to prevent overlapping snapshot→crop→upload cycles. */
  const isProcessingRef = useRef(false);
  /** Remaining burst frames (rapid captures at the start of recording). */
  const burstRef = useRef(BURST_COUNT);
  const sentCountRef = useRef(0);

  /** Updates both the React state and the mutable ref in sync. */
  const setCaptureStateSafe = useCallback((next: CaptureState) => {
    captureStateRef.current = next;
    setCaptureState(next);
  }, []);

  const format = useCameraFormat(device, [
    { photoResolution: 'max' },
    { fps: 30 },
  ]);
  const isActive = isScreenFocused;

  /** Cancels the pending capture timeout (if any). */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Game lifecycle ─────────────────────────────────────────────────

  /**
   * Stops recording, tells the server to finalise the game, and
   * navigates to GameReview with the reconstructed snapshots.
   * @param navigateToReview - If false, ends silently (used on discard).
   */
  const finishGame = useCallback(async (navigateToReview: boolean) => {
    clearTimer();
    const gameId = gameIdRef.current;
    if (!gameId) {
      setCaptureStateSafe('idle');
      return;
    }

    try {
      setCaptureStateSafe('processing');

      // Server returns the detected SAN move list
      const result = await endGame(gameId);

      console.log('[ScanGame] endGame result:', JSON.stringify(result));
      gameIdRef.current = null;
      setCaptureStateSafe('idle');

      if (navigateToReview && result.moves.length > 0) {
        // Replay moves to build full snapshot history for GameReview
        const snapshots = movesToSnapshots(result.moves, startingFenRef.current);
        navigation.navigate('GameReview', { snapshots, moves: result.moves });
      } else if (navigateToReview) {
        Alert.alert('No moves detected', 'The server could not detect any moves in the recording.');
      }
    } catch (error) {
      console.error('[ScanGame] endGame failed', error);
      gameIdRef.current = null;
      setCaptureStateSafe('idle');
    }
  }, [clearTimer, navigation, setCaptureStateSafe]);

  /** Discards the game on the server without navigating. */
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

  // ── Board detection loop (RTT-paced, idle only) ───────────────────
  // Same corner-detection loop as ScanBoard, but only runs while idle
  // (paused during recording and processing).

  const runBoardCheck = useCallback(async () => {
    while (checkActiveRef.current && mountedRef.current) {
      try {
        // Skip detection while recording or when camera isn't ready
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

  // ── Frame capture loop ────────────────────────────────────────────

  /**
   * Captures a single frame, crops it, and uploads it. Schedules itself
   * recursively via setTimeout to maintain a steady cadence (~8 fps
   * normally, ~25 fps during the initial burst).
   */
  const captureFrame = useCallback(async () => {
    // Schedule next tick immediately so cadence stays ~125 ms
    // regardless of how long this iteration takes.
    if (captureStateRef.current === 'recording') {
      clearTimer();
      if (burstRef.current > 0) { burstRef.current--; }
      const delay = burstRef.current > 0 ? BURST_INTERVAL_MS : CAPTURE_INTERVAL_MS;
      timerRef.current = setTimeout(() => captureFrame(), delay);
    }

    // Guard: skip if camera isn't ready or previous frame is still uploading
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

      // Fire-and-forget upload — increment counter optimistically
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

  // ── Record toggle handler ─────────────────────────────────────────

  /**
   * Toggles between recording and idle.
   * - If recording → finishes the game and navigates to review.
   * - If idle → opens a server session and kicks off the capture loop.
   */
  const handleRecordToggle = useCallback(async () => {
    if (captureState === 'recording') {
      await finishGame(true);
      return;
    }
    if (captureState !== 'idle') {
      return;
    }

    try {
      // Reset counters and start a fresh server session
      setFrameCount(0);
      sentCountRef.current = 0;
      burstRef.current = BURST_COUNT;
      startingFenRef.current = customFen ?? STARTING_FEN;
      const result = await startGame(boardFen);
      gameIdRef.current = result.game_id;
      setCaptureStateSafe('recording');
      captureFrame(); // Kick off the first frame immediately
    } catch (error) {
      console.error('[ScanGame] startGame failed', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to start game session');
    }
  }, [captureState, captureFrame, finishGame, setCaptureStateSafe, boardFen, customFen]);

  // ── Cleanup on unmount ────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearTimer();
      // If the user navigates away mid-recording, discard the session
      const gameId = gameIdRef.current;
      if (gameId) {
        discardGame(gameId).catch(() => {});
        gameIdRef.current = null;
      }
    };
  }, [clearTimer]);

  // ── Render ─────────────────────────────────────────────────────────

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
      <KeepAwake />

      {/* Full-screen camera feed */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        format={format}
        photo
        resizeMode="cover"
      />

      {/* 1. Opaque black mask — hides everything outside the viewfinder square */}
      <View style={styles.viewfinderContainer}>
        <View style={[styles.viewfinderTopMask, { height: overlayTopPx }]} />
        <View style={styles.viewfinderMiddleRow}>
          <View style={styles.viewfinderSideMask} />
          {/* Border stays default (green) while recording; shows detection color when idle */}
          <View style={[styles.viewfinderGuide, !isRecording && {borderColor: boardDetected ? styles.boardDetectedBorder.borderColor : styles.boardNotDetectedBorder.borderColor}]} />
          <View style={styles.viewfinderSideMask} />
        </View>
        <View style={styles.viewfinderBottomMask} />
      </View>

      {/* 2. UI controls overlay */}
      <View style={styles.overlayControls}>

        {/* Header with back arrow — cancels game on back if recording */}
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

        {/* Spacer pushes content below the viewfinder */}
        <View style={styles.viewfinderSpacer} />

        {/* Detection status — only visible when idle */}
        {isIdle && (
          <Text style={[styles.boardStatusText, {color: boardDetected ? styles.boardDetectedBorder.borderColor : styles.boardNotDetectedBorder.borderColor}]}>
            {boardDetected ? '✓ BOARD DETECTED' : '✗ NO BOARD DETECTED'}
          </Text>
        )}

        {/* Tips list — shown only while idle */}
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

        {/* Live frame counter — shown while recording */}
        {isRecording && (
          <View style={localStyles.statusBar}>
            <Text style={localStyles.statusText}>
              {frameCount > 0
                ? `${frameCount} frame${frameCount !== 1 ? 's' : ''} captured`
                : 'Watching for moves…'}
            </Text>
          </View>
        )}

        {/* Full-screen processing overlay — shown while server finalises */}
        {isProcessing && (
          <View style={localStyles.processingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={localStyles.processingTitle}>Processing frames…</Text>
          </View>
        )}

        {/* Record / Stop button */}
        <View style={styles.captureButtonContainer}>
          {!isProcessing && (
            <View style={styles.captureButtonGroup}>
              <TouchableOpacity
                style={[styles.captureButton, isRecording && localStyles.recordingButton]}
                onPress={handleRecordToggle}
              >
                <Text style={styles.buttonText}>{isRecording ? 'Stop' : 'Record'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

