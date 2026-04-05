/**
 * ProfileScreen.tsx — User profile, account actions, and navigation hub.
 *
 * Responsibilities:
 *  - Displays current user info (avatar, name, email, username).
 *  - Inline username editing with availability check and validation.
 *  - Navigation menu to Game Library and Friends.
 *  - Sign-out and account deletion flows (with double confirmation).
 */

import React, {useState, useCallback} from 'react';
import {View, Text, TouchableOpacity, Image, Alert, TextInput, ActivityIndicator} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../shared/types/navigation';
import {useAuth} from '../context/AuthContext';
import {updateUsername, checkUsername} from '../../services/auth';
import {styles} from '../../ui/styles/ProfileScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

// ── Component ────────────────────────────────────────────────────────────

/**
 * Profile hub — shows user identity, provides username editing,
 * navigation shortcuts, and destructive account actions.
 */
export const ProfileScreen = ({navigation}: Props) => {
  const {user, signOut, setUser, deleteAccount} = useAuth();

  // ── Username-edit state ──────────────────────────────────────────────

  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // ── Account actions ──────────────────────────────────────────────────

  /** Shows a confirmation alert then signs the user out. */
  const onSignOutPress = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          navigation.popToTop();
        },
      },
    ]);
  };

  /** Double-confirmation flow for permanent account deletion. */
  const onDeleteAccountPress = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, all saved games, and friend connections. This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Type "delete" mentally and confirm. All data will be lost forever.',
              [
                {text: 'Cancel', style: 'cancel'},
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      navigation.popToTop();
                    } catch (err: any) {
                      Alert.alert('Error', err.message ?? 'Failed to delete account');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  // ── Username editing ─────────────────────────────────────────────────

  /** Enters edit mode, pre-filling the current username. */
  const startEditUsername = useCallback(() => {
    setNewUsername(user?.username ?? '');
    setUsernameError(null);
    setEditingUsername(true);
  }, [user]);

  /** Exits edit mode and clears any validation error. */
  const cancelEditUsername = useCallback(() => {
    setEditingUsername(false);
    setUsernameError(null);
  }, []);

  /**
   * Validates, checks availability, and persists a new username.
   * Format: 3–20 lowercase alphanumeric or underscores.
   */
  const saveUsername = useCallback(async () => {
    const cleaned = newUsername.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleaned)) {
      setUsernameError('3-20 characters, letters, numbers, underscores only');
      return;
    }
    if (cleaned === user?.username) {
      setEditingUsername(false);
      return;
    }
    setChecking(true);
    setUsernameError(null);
    try {
      const available = await checkUsername(cleaned);
      if (!available) {
        setUsernameError('Username already taken');
        setChecking(false);
        return;
      }
    } catch (err: any) {
      setUsernameError(err.message ?? 'Check failed');
      setChecking(false);
      return;
    }
    setChecking(false);
    setSaving(true);
    try {
      const updated = await updateUsername(cleaned);
      setUser(updated);
      setEditingUsername(false);
    } catch (err: any) {
      setUsernameError(err.message ?? 'Failed to update');
    } finally {
      setSaving(false);
    }
  }, [newUsername, user, setUser]);

  // ── Early return ──────────────────────────────────────────────────────

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Not signed in</Text>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* User info — avatar, name, email */}
      <View style={styles.profileHeader}>
        {user.picture ? (
          <Image source={{uri: user.picture}} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarLetter}>{user.name?.charAt(0) ?? '?'}</Text>
          </View>
        )}
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>

        {/* Username display / inline edit toggle */}
        {!editingUsername ? (
          <TouchableOpacity style={styles.usernameRow} onPress={startEditUsername}>
            <Text style={styles.usernameLabel}>@{user.username ?? 'no username'}</Text>
            <Text style={styles.editIcon}>✏️</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.usernameEditRow}>
            <TextInput
              style={styles.usernameInput}
              value={newUsername}
              onChangeText={t => {
                setNewUsername(t);
                setUsernameError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              placeholder="username"
              placeholderTextColor="#6b7a9e"
            />
            <TouchableOpacity
              style={styles.usernameSaveBtn}
              onPress={saveUsername}
              disabled={checking || saving}>
              {checking || saving ? (
                <ActivityIndicator color="#4ade80" size="small" />
              ) : (
                <Text style={styles.usernameSaveText}>✓</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.usernameCancelBtn} onPress={cancelEditUsername}>
              <Text style={styles.usernameCancelText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {usernameError && <Text style={styles.usernameError}>{usernameError}</Text>}
      </View>

      {/* Navigation menu — Game Library, Friends */}
      <View style={styles.menu}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('GameLibrary')}
          activeOpacity={0.8}
        >
          <Text style={styles.menuIcon}>📚</Text>
          <View style={styles.menuTextWrapper}>
            <Text style={styles.menuTitle}>Game Library</Text>
            <Text style={styles.menuSubtitle}>Saved games and positions</Text>
          </View>
          <Text style={styles.menuChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('Friends')}
          activeOpacity={0.8}
        >
          <Text style={styles.menuIcon}>👥</Text>
          <View style={styles.menuTextWrapper}>
            <Text style={styles.menuTitle}>Friends</Text>
            <Text style={styles.menuSubtitle}>Manage friends and requests</Text>
          </View>
          <Text style={styles.menuChevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Destructive actions — sign out, delete account */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.signOutButton} onPress={onSignOutPress} activeOpacity={0.8}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteAccountButton} onPress={onDeleteAccountPress} activeOpacity={0.8}>
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
