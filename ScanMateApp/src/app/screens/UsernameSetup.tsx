/**
 * UsernameSetup.tsx — First-time username selection screen.
 *
 * Responsibilities:
 *  - Shown after initial sign-in when the user has no username yet.
 *  - Validates format (3–20 lowercase alphanumeric / underscore).
 *  - Checks server-side availability before allowing submission.
 *  - Persists the chosen username and hands the updated user back
 *    to the parent via `onComplete`.
 */

import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {checkUsername, updateUsername} from '../../services/auth';
import type {AuthUser} from '../../services/auth';
import {styles} from '../../ui/styles/UsernameSetup.styles';

type Props = {
  /** Called with the updated AuthUser once a username is successfully set. */
  onComplete: (updatedUser: AuthUser) => void;
};

// ── Component ────────────────────────────────────────────────────────────

/**
 * Full-screen username picker with availability check and submit flow.
 */
export const UsernameSetup = ({onComplete}: Props) => {
  // ── State ──────────────────────────────────────────────────────────

  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Derived values ─────────────────────────────────────────────────

  /** Normalised input (trimmed, lowercased). */
  const cleaned = value.trim().toLowerCase();
  /** True when the input matches the allowed format. */
  const valid = /^[a-z0-9_]{3,20}$/.test(cleaned);

  // ── Handlers ───────────────────────────────────────────────────────

  /** Checks if the entered username is available on the server. */
  const handleCheck = useCallback(async () => {
    if (!valid) {
      setError('3-20 characters, letters, numbers, underscores only');
      setAvailable(null);
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const isAvailable = await checkUsername(cleaned);
      setAvailable(isAvailable);
      if (!isAvailable) {
        setError('Username is already taken');
      }
    } catch (err: any) {
      setError(err.message ?? 'Check failed');
    } finally {
      setChecking(false);
    }
  }, [cleaned, valid]);

  /** Persists the username on the server and notifies the parent. */
  const handleSubmit = useCallback(async () => {
    if (!valid || available !== true) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updatedUser = await updateUsername(cleaned);
      onComplete(updatedUser);
    } catch (err: any) {
      const msg = err.message ?? 'Failed to set username';
      setError(msg);
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }, [cleaned, valid, available, onComplete]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Your Username</Text>
      <Text style={styles.subtitle}>
        This is how friends will find you. You can change it later.
      </Text>

      {/* Username input field */}
      <TextInput
        style={styles.input}
        placeholder="username"
        placeholderTextColor="#6b7a9e"
        value={value}
        onChangeText={t => {
          setValue(t);
          setAvailable(null);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        onSubmitEditing={handleCheck}
        returnKeyType="done"
      />

      {/* Validation / availability feedback */}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {available === true && <Text style={styles.availableText}>✓ Available!</Text>}

      {/* Two-phase button: check availability → confirm */}
      {available !== true ? (
        <TouchableOpacity
          style={[styles.button, (!valid || checking) && styles.buttonDisabled]}
          disabled={!valid || checking}
          onPress={handleCheck}>
          {checking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Check Availability</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.button, styles.confirmButton, saving && styles.buttonDisabled]}
          disabled={saving}
          onPress={handleSubmit}>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Set Username</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};
