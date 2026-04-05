/**
 * ScanBoard.tsx — Camera-based chessboard scanner screen.
 *
 * Responsibilities:
 *  - Opens the rear camera in full-screen with a viewfinder overlay.
 *  - Runs a continuous board-detection loop (RTT-paced) that checks whether
 *    all four board corners are visible in the cropped frame.
 *  - Shows real-time feedback (green/red border + status text).
 *  - Captures a high-quality snapshot on button press, crops it to the
 *    viewfinder square, and navigates to the Result screen for recognition.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Text, View, TouchableOpacity, ActivityIndicator, Alert, Dimensions, StyleSheet} from 'react-native';
import {Camera, useCameraDevice, useCameraFormat} from 'react-native-vision-camera';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useIsFocused} from '@react-navigation/native';
import KeepAwake from 'react-native-keep-awake';

import {styles} from '../../ui/styles/ScanBoard.styles';
import type {RootStackParamList} from '../../shared/types/navigation';
import {ScreenHeader} from '../../ui/components/ScreenHeader';
import {getBoardSize, HEADER_HEIGHT} from '../../shared/constants/layout';
import {cropFrameToBoard} from '../../shared/utils/cropFrame';
import {checkBoardCorners} from '../../services/api';

// ── Constants ────────────────────────────────────────────────────────

/** Vertical gap between the header and the viewfinder square. */
const BOARD_TOP_GAP = 24;

const SCAN_TIPS = [
  'Keep the phone steady directly above the board',
  'Make sure all four corners sit inside the green frame',
  'Avoid harsh shadows or glare on the pieces',
];

// ── Component ────────────────────────────────────────────────────────

type ScanBoardProps = NativeStackScreenProps<RootStackParamList, 'ScanBoard'>;

/**
 * Full-screen camera scanner with a viewfinder overlay.
 *
 * Continuously snapshots the camera at low quality, crops to the
 * viewfinder square, and sends the crop to the ML server to check
 * whether four board corners are detected. Once the user presses
 * "Capture", a higher-quality snapshot is taken, cropped, and
 * forwarded to the Result screen.
 */
export const ScanBoard = ({navigation}: ScanBoardProps) => {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  /** True when the ML server detects all four board corners in the viewfinder. */
  const [boardDetected, setBoardDetected] = useState(false);
  /** Controls the detection loop — set to false during capture. */
  const checkActiveRef = useRef(true);
  const mountedRef = useRef(true);
  const isScreenFocused = useIsFocused();

  // ── Layout calculations ─────────────────────────────────────────────
  const boardSize = getBoardSize();
  const windowDimensions = Dimensions.get('window');
  const windowWidth = windowDimensions.width;
  const windowHeight = windowDimensions.height;
  /** Y offset (px) where the viewfinder square starts. */
  const overlayTopPx = HEADER_HEIGHT + BOARD_TOP_GAP;
  /** X offset (px) to horizontally center the viewfinder. */
  const boardOffsetX = (windowWidth - boardSize) / 2;

  const format = useCameraFormat(device, [
    {photoResolution: 'max'},
    {fps: 30},
  ]);

  const isActive = isScreenFocused;

  // ── Board detection loop (RTT-paced) ────────────────────────────────
  // Takes low-quality snapshots continuously, crops to the viewfinder
  // square, and pings the ML server. Each new request starts only after
  // the previous one completes (round-trip-time pacing).

  const runBoardCheck = useCallback(async () => {
    while (checkActiveRef.current && mountedRef.current) {
      try {
        if (!cameraRef.current) {
          await new Promise(r => setTimeout(r, 300)); // Camera not ready yet
          continue;
        }
        // Low-quality snapshot for detection (saves bandwidth)
        const snap = await cameraRef.current.takeSnapshot({quality: 50});
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
        // Camera not ready or transient error — continue loop
      }
    }
  }, [boardOffsetX, boardSize, overlayTopPx, windowHeight, windowWidth]);

  /** Start detection loop on mount; tear down on unmount. */
  useEffect(() => {
    mountedRef.current = true;
    checkActiveRef.current = true;
    runBoardCheck();
    return () => {
      mountedRef.current = false;
      checkActiveRef.current = false;
    };
  }, [runBoardCheck]);

  // ── Capture handler ─────────────────────────────────────────────────

  /**
   * Takes a higher-quality snapshot, crops it to the viewfinder square,
   * and navigates to the Result screen with the cropped image path.
   * Pauses the detection loop while capturing.
   */
  const capturePhoto = async () => {
    if (cameraRef.current == null || isCapturing) {
      return;
    }

    setIsCapturing(true);
    checkActiveRef.current = false; // Pause detection loop during capture
    let resizedPath: string | null = null;

    try {
      const photo = await cameraRef.current.takeSnapshot({quality: 85});
      if (!photo.width || !photo.height) {
        throw new Error('Captured photo is missing size information');
      }

      resizedPath = await cropFrameToBoard({
        photoPath: photo.path,
        photoWidth: photo.width,
        photoHeight: photo.height,
        windowWidth,
        windowHeight,
        boardSize,
        boardOffsetX,
        overlayTopPx,
      });
    } catch (error) {
      console.error('Capture/Resize FAILED:', error);
      Alert.alert('Capture Failed!', 'There was an issue saving the photo.');
    } finally {
      setIsCapturing(false);
      checkActiveRef.current = true; // Resume detection loop
      runBoardCheck();
    }

    if (resizedPath) {
      navigation.navigate('Result', {photoPath: resizedPath});
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (device == null) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No camera device found.</Text>
      </View>
    );
  }
  
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
        photo={true}
        resizeMode="cover"
      />

      {/* 1. Opaque black mask — hides everything outside the viewfinder square */}
      <View style={styles.viewfinderContainer}>
        <View style={[styles.viewfinderTopMask, {height: overlayTopPx}]} />
          <View style={styles.viewfinderMiddleRow}>
            <View style={styles.viewfinderSideMask} />
            {/* Transparent square cutout — border color reflects detection status */}
            <View style={[styles.viewfinderGuide, {borderColor: boardDetected ? styles.boardDetectedBorder.borderColor : styles.boardNotDetectedBorder.borderColor}]} />
            <View style={styles.viewfinderSideMask} />
          </View>
          <View style={styles.viewfinderBottomMask} />
      </View>

      {/* 2. UI controls overlay — header, tips, status, capture button */}
      <View style={styles.overlayControls}>
        
        {/* Header with back arrow */}
        <View style={styles.instructionBox}>
          <ScreenHeader
            title="Scan Board"
            onBack={() => navigation.goBack()}
            style={styles.screenHeader}
          />
        </View>

        {/* Spacer pushes tips below the viewfinder */}
        <View style={styles.viewfinderSpacer} />

        {/* Real-time detection status */}
        <Text style={[styles.boardStatusText, {color: boardDetected ? styles.boardDetectedBorder.borderColor : styles.boardNotDetectedBorder.borderColor}]}>
          {boardDetected ? '✓ BOARD DETECTED' : '✗ NO BOARD DETECTED'}
        </Text>

        {/* Scanning tips list */}
        <View style={[styles.tipsList, { width: boardSize }]}>
          {SCAN_TIPS.map((tip) => (
            <Text key={tip} style={styles.tipText}>
              {`• ${tip}`}
            </Text>
          ))}
        </View>
        
        {/* Capture button (disabled while a capture is in progress) */}
        <View style={styles.captureButtonContainer}>
          <TouchableOpacity
            style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
            onPress={capturePhoto}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Capture</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};