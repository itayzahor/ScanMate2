import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Text, View, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Dimensions} from 'react-native';
import {Camera, useCameraDevice, useCameraFormat} from 'react-native-vision-camera';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useIsFocused} from '@react-navigation/native';

import {styles} from '../../ui/styles/ScanBoard.styles';
import type {RootStackParamList} from '../../shared/types/navigation';
import {ScreenHeader} from '../../ui/components/ScreenHeader';
import {getBoardSize, HEADER_HEIGHT} from '../../shared/constants/layout';
import {cropFrameToBoard} from '../../shared/utils/cropFrame';
import {checkBoardCorners} from '../../services/api';

const BOARD_TOP_GAP = 24;
const SCAN_TIPS = [
  'Keep the phone steady directly above the board',
  'Make sure all four corners sit inside the green frame',
  'Avoid harsh shadows or glare on the pieces',
];

type ScanBoardProps = NativeStackScreenProps<RootStackParamList, 'ScanBoard'>;

export const ScanBoard = ({navigation}: ScanBoardProps) => {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [boardDetected, setBoardDetected] = useState(false);
  const checkActiveRef = useRef(true);
  const mountedRef = useRef(true);
  const isScreenFocused = useIsFocused();
  const boardSize = getBoardSize();
  const windowDimensions = Dimensions.get('window');
  const windowWidth = windowDimensions.width;
  const windowHeight = windowDimensions.height;
  const overlayTopPx = HEADER_HEIGHT + BOARD_TOP_GAP;
  const boardOffsetX = (windowWidth - boardSize) / 2;

  const format = useCameraFormat(device, [
    {photoResolution: 'max'},
    {fps: 30},
  ]);

  const isActive = isScreenFocused;

  // --- Board check loop (RTT-paced) ---
  const runBoardCheck = useCallback(async () => {
    while (checkActiveRef.current && mountedRef.current) {
      try {
        if (!cameraRef.current) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
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

  useEffect(() => {
    mountedRef.current = true;
    checkActiveRef.current = true;
    runBoardCheck();
    return () => {
      mountedRef.current = false;
      checkActiveRef.current = false;
    };
  }, [runBoardCheck]);

  const capturePhoto = async () => {
    if (cameraRef.current == null || isCapturing) {
      return;
    }

    setIsCapturing(true);
    checkActiveRef.current = false;
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
      checkActiveRef.current = true;
      runBoardCheck();
    }

    if (resizedPath) {
      navigation.navigate('Result', {photoPath: resizedPath});
    }
  };
  if (device == null) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No camera device found.</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        format={format} 
        photo={true}
        resizeMode="cover"
      />
      
      {/* 1. OPAQUE BLACK MASK (Masks the area outside the board square) */}
      <View style={styles.viewfinderContainer}>
        <View style={[styles.viewfinderTopMask, {height: overlayTopPx}]} />
          <View style={styles.viewfinderMiddleRow}>
            <View style={styles.viewfinderSideMask} />
            {/* The transparent square cutout */}
            <View style={[styles.viewfinderGuide, {borderColor: boardDetected ? styles.boardDetectedBorder.borderColor : styles.boardNotDetectedBorder.borderColor}]} />
            <View style={styles.viewfinderSideMask} />
          </View>
          <View style={styles.viewfinderBottomMask} />
      </View>
      
      {/* 2. CONTROLS OVERLAY (The UI Layer) */}
      <View style={styles.overlayControls}>
        
        {/* Top instructions text */}
        <View style={styles.instructionBox}>
          <ScreenHeader
            title="Scan Board"
            onBack={() => navigation.goBack()}
            style={styles.screenHeader}
          />
        </View>

        <View style={styles.viewfinderSpacer} />

        <Text style={[styles.boardStatusText, {color: boardDetected ? styles.boardDetectedBorder.borderColor : styles.boardNotDetectedBorder.borderColor}]}>
          {boardDetected ? '✓ BOARD DETECTED' : '✗ NO BOARD DETECTED'}
        </Text>

        <View style={[styles.tipsList, { width: boardSize }]}>
          {SCAN_TIPS.map((tip) => (
            <Text key={tip} style={styles.tipText}>
              {`• ${tip}`}
            </Text>
          ))}
        </View>
        
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