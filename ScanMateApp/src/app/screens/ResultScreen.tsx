/**
 * ResultScreen.tsx — Photo confirmation screen.
 *
 * Shown after ScanBoard captures a cropped board image.
 * The user previews the photo and either accepts (uploads it to the
 * ML server for piece recognition → navigates to Analysis) or retakes
 * (goes back to ScanBoard).
 */

import React, {useState} from 'react';
import {View, Image, TouchableOpacity, Alert, ActivityIndicator, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {styles} from '../../ui/styles/ResultScreen.styles';
import {uploadBoardPhoto} from '../../services/api';
import {normalizeFen} from '../../shared/utils/fen';
import {ScreenHeader} from '../../ui/components/ScreenHeader';
import {getBoardSize} from '../../shared/constants/layout';
import type {RootStackParamList} from '../../shared/types/navigation';

// ── Constants ────────────────────────────────────────────────────

const RESULT_TIPS = [
  'Confirm every square is visible edge to edge',
  'Retake if pieces look blurry or cut off',
];

// ── Component ────────────────────────────────────────────────────

type ResultScreenProps = NativeStackScreenProps<RootStackParamList, 'Result'>;

/**
 * Displays the cropped board photo for user confirmation.
 * Accept uploads the image and navigates to Analysis with the
 * recognised FEN; Retake returns to the camera.
 */
export const ResultScreen = ({route, navigation}: ResultScreenProps) => {
  const {photoPath} = route.params;
  const [isProcessing, setIsProcessing] = useState(false);
  const boardSize = getBoardSize();

  // ── Handlers ────────────────────────────────────────────────────

  /** Uploads the photo to the ML server and navigates to Analysis on success. */
  const onAccept = async () => {
    try {
      setIsProcessing(true);
      const fen = await uploadBoardPhoto(photoPath);
      const normalizedFen = normalizeFen(fen);
      navigation.navigate('Analysis', {fen: normalizedFen});
    } catch (error) {
      console.error('Upload failed', error);
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsProcessing(false);
    }
  };

  /** Returns to ScanBoard so the user can capture a new photo. */
  const onRetake = () => {
    navigation.goBack();
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerContainer}>
          <ScreenHeader
            title="Confirm Photo"
            onBack={() => navigation.goBack()}
          />
        </View>

        {/* Cropped board preview — sized to match the viewfinder square */}
        <View style={[styles.imageDisplayArea, {width: boardSize, height: boardSize}]}>
          <Image
            source={{ uri: `file://${photoPath}` }}
            style={styles.image}
          />
        </View>

        {/* Quick quality-check tips */}
        <View style={styles.tipsList}>
          {RESULT_TIPS.map((tip) => (
            <Text key={tip} style={styles.tipText}>
              {`• ${tip}`}
            </Text>
          ))}
        </View>

        <View style={styles.spacer} />

        {/* Retake / Accept buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.retakeButton]}
            onPress={onRetake}
            disabled={isProcessing}
          >
            <Text style={styles.buttonText}>❌</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.acceptButton]}
            onPress={onAccept}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>✅</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Full-screen overlay while the ML server analyses the image */}
      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.loadingText}>Analyzing board...</Text>
        </View>
      )}
    </View>
  );
};