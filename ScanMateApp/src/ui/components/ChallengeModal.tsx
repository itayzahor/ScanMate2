// ChallengeModal.tsx — Pick your color and send a game challenge
import React, {useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import type {FriendUser} from '../../services/friends';

type Props = {
  visible: boolean;
  friend: FriendUser | null;
  startingFen?: string;
  onSend: (color: 'white' | 'black') => void;
  onCancel: () => void;
  loading?: boolean;
};

export function ChallengeModal({visible, friend, startingFen, onSend, onCancel, loading}: Props) {
  const [selectedColor, setSelectedColor] = useState<'white' | 'black'>('white');

  if (!friend) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Friend info */}
          <View style={styles.friendRow}>
            {friend.picture ? (
              <Image source={{uri: friend.picture}} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarLetter}>{friend.name?.charAt(0) ?? '?'}</Text>
              </View>
            )}
            <Text style={styles.friendName}>{friend.name}</Text>
          </View>

          <Text style={styles.title}>Challenge to a game</Text>

          {startingFen && startingFen !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' && (
            <Text style={styles.fenNote}>Custom starting position</Text>
          )}

          {/* Color picker */}
          <Text style={styles.label}>Play as:</Text>
          <View style={styles.colorRow}>
            <TouchableOpacity
              style={[styles.colorBtn, selectedColor === 'white' && styles.colorBtnActive]}
              onPress={() => setSelectedColor('white')}>
              <Text style={styles.colorIcon}>♔</Text>
              <Text style={[styles.colorLabel, selectedColor === 'white' && styles.colorLabelActive]}>
                White
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.colorBtn, selectedColor === 'black' && styles.colorBtnActive]}
              onPress={() => setSelectedColor('black')}>
              <Text style={styles.colorIcon}>♚</Text>
              <Text style={[styles.colorLabel, selectedColor === 'black' && styles.colorLabelActive]}>
                Black
              </Text>
            </TouchableOpacity>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => onSend(selectedColor)}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendText}>Send Challenge ⚔️</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#141b2d',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#1c2b4b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#f5f7ff',
    fontSize: 16,
    fontWeight: '700',
  },
  friendName: {
    color: '#f5f7ff',
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    color: '#91a0c7',
    fontSize: 14,
    marginBottom: 12,
  },
  fenNote: {
    color: '#f0ad4e',
    fontSize: 12,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  label: {
    color: '#91a0c7',
    fontSize: 13,
    marginBottom: 8,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  colorBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0c111d',
  },
  colorBtnActive: {
    borderColor: '#4ade80',
    backgroundColor: '#1c3a2a',
  },
  colorIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  colorLabel: {
    color: '#91a0c7',
    fontSize: 14,
    fontWeight: '600',
  },
  colorLabelActive: {
    color: '#4ade80',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelText: {
    color: '#91a0c7',
    fontSize: 14,
    fontWeight: '600',
  },
  sendBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#4ade80',
  },
  sendText: {
    color: '#0c111d',
    fontSize: 14,
    fontWeight: '700',
  },
});
