/**
 * Main.tsx — Landing / home screen of the app.
 *
 * Responsibilities:
 *  - Shows the app branding and tagline.
 *  - Renders a top-right auth widget (sign-in button or user avatar).
 *  - Provides two primary entry-point cards:
 *      1. "Scan a Position" → opens the camera-based board scanner.
 *      2. "Set Up & Play"  → opens the analysis board from the standard starting position.
 */

import React, {useState} from 'react';
import {View, Text, TouchableOpacity, Image, Alert, ActivityIndicator} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../shared/types/navigation';
import {STARTING_FEN} from '../../shared/utils/fen';
import {useAuth} from '../context/AuthContext';
import {styles} from '../../ui/styles/Main.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

/**
 * Home screen component.
 *
 * Uses `AuthContext` to determine sign-in state and display either
 * a Google sign-in button or the user's avatar (tapping it navigates
 * to the Profile screen).
 */
export const Main = ({navigation}: Props) => {
  const {user, loading: authLoading, signIn} = useAuth();
  /** Local flag to show a spinner while the Google sign-in flow is in progress. */
  const [signingIn, setSigningIn] = useState(false);

  /** Triggers Google sign-in and handles errors with a native alert. */
  const onSignInPress = async () => {
    setSigningIn(true);
    try {
      await signIn();
    } catch (err: any) {
      Alert.alert('Sign-In Failed', err.message ?? 'Something went wrong');
    } finally {
      setSigningIn(false);
    }
  };

  // ── Navigation handlers ───────────────────────────────────────────
  const onProfilePress = () => navigation.navigate('Profile');
  const onScanPress = () => navigation.navigate('ScanBoard');
  const onAnalysisPress = () => navigation.navigate('Analysis', {fen: STARTING_FEN});

  return (
    <View style={styles.container}>
      {/* ── Auth row (top-right corner) ─────────────────────────────── */}
      <View style={styles.authRow}>
        {authLoading || signingIn ? (
          <ActivityIndicator color="#91a0c7" />
        ) : user ? (
          // Signed-in: show avatar + name, tapping opens Profile
          <TouchableOpacity style={styles.userRow} onPress={onProfilePress} activeOpacity={0.7}>
            {user.picture ? (
              <Image source={{uri: user.picture}} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarLetter}>{user.name?.charAt(0) ?? '?'}</Text>
              </View>
            )}
            <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
          </TouchableOpacity>
        ) : (
          // Signed-out: show "Sign in with Google" button
          <TouchableOpacity style={styles.signInButton} onPress={onSignInPress} activeOpacity={0.8}>
            <Text style={styles.signInText}>Sign in with Google</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Hero content ────────────────────────────────────────────── */}
      <View style={styles.content}>
        <Text style={styles.appName}>ScanMate</Text>
        <Text style={styles.subtitle}>Computer vision tools for chess training</Text>

        {/* Primary CTA – opens camera scanner */}
        <TouchableOpacity style={styles.primaryButton} onPress={onScanPress} activeOpacity={0.85}>
          <View style={styles.buttonIconContainer}>
            <Text style={styles.buttonIcon}>📷</Text>
          </View>
          <View style={styles.buttonTextWrapper}>
            <Text style={styles.buttonTitle}>Scan a Position</Text>
            <Text style={styles.buttonSubtitle}>Capture a board and get instant recognition</Text>
          </View>
        </TouchableOpacity>

        {/* Secondary CTA – opens analysis board at starting position */}
        <TouchableOpacity style={styles.secondaryButton} onPress={onAnalysisPress} activeOpacity={0.85}>
          <View style={styles.buttonIconContainer}>
            <Text style={styles.buttonIcon}>♟</Text>
          </View>
          <View style={styles.buttonTextWrapper}>
            <Text style={styles.buttonTitle}>Set Up & Play</Text>
            <Text style={styles.buttonSubtitle}>Edit a position, analyze, or record a full game</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};