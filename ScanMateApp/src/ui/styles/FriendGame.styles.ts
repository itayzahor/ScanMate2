import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c111d',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#91a0c7',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backText: {
    color: '#91a0c7',
    fontSize: 16,
  },
  resultText: {
    color: '#f0ad4e',
    fontSize: 18,
    fontWeight: '800',
  },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  playerBarTop: {},
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  playerAvatarPlaceholder: {
    backgroundColor: '#1c2b4b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerAvatarLetter: {
    color: '#f5f7ff',
    fontSize: 14,
    fontWeight: '700',
  },
  playerName: {
    color: '#f5f7ff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  turnBadge: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  boardWrapper: {
    alignSelf: 'center',
    marginVertical: 4,
  },
  moveStrip: {
    maxHeight: 40,
    marginHorizontal: 16,
    marginTop: 4,
  },
  moveStripContent: {
    alignItems: 'center',
    gap: 4,
    paddingRight: 12,
  },
  moveChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#141b2d',
  },
  moveChipActive: {
    backgroundColor: '#1c3a2a',
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  moveChipText: {
    color: '#91a0c7',
    fontSize: 13,
    fontWeight: '500',
  },
  moveChipTextActive: {
    color: '#4ade80',
  },
  liveChip: {
    backgroundColor: '#1c2b4b',
  },
  liveChipText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  actionBtnPrimary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4ade80',
  },
  actionBtnPrimaryText: {
    color: '#0c111d',
    fontSize: 14,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1c2b4b',
  },
  actionBtnSecondaryText: {
    color: '#f5f7ff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnDanger: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#3a1c1c',
  },
  actionBtnDangerText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '700',
  },
});
