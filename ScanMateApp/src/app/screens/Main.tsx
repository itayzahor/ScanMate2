// src/screens/Main.tsx
import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../App';
import {STARTING_FEN} from '../../shared/utils/fen';
import {useAuth} from '../context/AuthContext';

// This component receives a 'navigation' prop from the navigator
// Define the prop types for this screen
type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

export const Main = ({navigation}: Props) => {
  const {user, loading: authLoading, signIn} = useAuth();
  const [signingIn, setSigningIn] = useState(false);

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

  const onProfilePress = () => {
    navigation.navigate('Profile');
  };

  const onScanPress = () => {
    navigation.navigate('ScanBoard');
  };

  const onAnalysisPress = () => {
    navigation.navigate('Analysis', {fen: STARTING_FEN});
  };

  return (
    <View style={styles.container}>
      {/* Sign-In / User Header */}
      <View style={styles.authRow}>
        {authLoading || signingIn ? (
          <ActivityIndicator color="#91a0c7" />
        ) : user ? (
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
          <TouchableOpacity style={styles.signInButton} onPress={onSignInPress} activeOpacity={0.8}>
            <Text style={styles.signInText}>Sign in with Google</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.appName}>ScanMate</Text>
        <Text style={styles.subtitle}>Computer vision tools for chess training</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={onScanPress} activeOpacity={0.85}>
          <View style={styles.buttonIconContainer}>
            <Text style={styles.buttonIcon}>📷</Text>
          </View>
          <View style={styles.buttonTextWrapper}>
            <Text style={styles.buttonTitle}>Scan a Position</Text>
            <Text style={styles.buttonSubtitle}>Capture a board and get instant recognition</Text>
          </View>
        </TouchableOpacity>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c111d',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },
  authRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    minHeight: 40,
    marginBottom: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  avatarPlaceholder: {
    backgroundColor: '#1c2b4b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#f5f7ff',
    fontSize: 14,
    fontWeight: '700',
  },
  userName: {
    color: '#f5f7ff',
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 160,
  },
  signInButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1c2b4b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  signInText: {
    color: '#91a0c7',
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  appName: {
    color: '#f5f7ff',
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#91a0c7',
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 48,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#1c2b4b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#141b2d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  buttonIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  buttonIcon: {
    fontSize: 26,
  },
  buttonTextWrapper: {
    flex: 1,
  },
  buttonTitle: {
    color: '#f5f7ff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  buttonSubtitle: {
    color: '#8b98c7',
    fontSize: 14,
  },
});