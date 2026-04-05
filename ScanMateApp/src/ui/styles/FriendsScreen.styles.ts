import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: '#0c111d',
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0c111d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    marginBottom: 16,
  },
  backText: {
    color: '#91a0c7',
    fontSize: 16,
  },
  heading: {
    color: '#f5f7ff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },

  // ── Active game banner ──────────────────────────────────────────
  activeGameBanner: {
    backgroundColor: '#1a2a1a',
    borderColor: '#2d5a2d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeGameText: {
    color: '#a3e635',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  continueText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '700',
  },
  pendingGameText: {
    color: '#91a0c7',
    fontSize: 13,
    fontStyle: 'italic',
  },
  cancelChallengeBtn: {
    marginTop: 8,
    backgroundColor: '#b71c1c',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  cancelChallengeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Search ──────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#141b2d',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f5f7ff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  searchBtn: {
    backgroundColor: '#1c2b4b',
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnDisabled: {
    opacity: 0.4,
  },
  searchBtnText: {
    color: '#f5f7ff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchResultsWrapper: {
    marginBottom: 12,
  },
  searchResultCard: {
    backgroundColor: '#141b2d',
    borderRadius: 14,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  addFriendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1c3a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  addFriendIcon: {
    fontSize: 16,
    color: '#4ade80',
  },

  // ── Friend card actions ─────────────────────────────────────────
  challengeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2b1c4b',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  challengeBtnDisabled: {
    opacity: 0.35,
  },
  challengeIcon: {
    fontSize: 18,
  },
  removeFriendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3a1c1c',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeFriendIcon: {
    fontSize: 16,
    color: '#f87171',
    fontWeight: '700',
  },

  // ── List ────────────────────────────────────────────────────────
  list: {
    paddingBottom: 40,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    color: '#91a0c7',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },

  // ── Card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#141b2d',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  cardTextWrapper: {
    flex: 1,
  },
  cardName: {
    color: '#f5f7ff',
    fontSize: 15,
    fontWeight: '600',
  },
  cardEmail: {
    color: '#91a0c7',
    fontSize: 12,
    marginTop: 1,
  },
  pendingBadge: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },

  // ── Accept / Reject buttons ─────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  acceptBtn: {
    backgroundColor: '#1c3a2a',
  },
  rejectBtn: {
    backgroundColor: '#3a1c1c',
  },
  acceptText: {
    color: '#4ade80',
    fontWeight: '700',
    fontSize: 13,
  },
  rejectText: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 13,
  },

  // ── Empty state ─────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#f5f7ff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#91a0c7',
    fontSize: 14,
    textAlign: 'center',
  },
});
