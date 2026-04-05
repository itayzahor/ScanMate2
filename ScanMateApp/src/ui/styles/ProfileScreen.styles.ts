import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: '#0c111d',
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  backButton: {
    marginBottom: 24,
  },
  backText: {
    color: '#91a0c7',
    fontSize: 16,
  },

  // ── Profile header ──────────────────────────────────────────────────
  profileHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    backgroundColor: '#1c2b4b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#f5f7ff',
    fontSize: 32,
    fontWeight: '700',
  },
  userName: {
    color: '#f5f7ff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  userEmail: {
    color: '#91a0c7',
    fontSize: 14,
  },

  // ── Username editing ────────────────────────────────────────────────
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  usernameLabel: {
    color: '#91a0c7',
    fontSize: 15,
    fontWeight: '600',
  },
  editIcon: {
    fontSize: 14,
  },
  usernameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  usernameInput: {
    flex: 1,
    backgroundColor: '#141b2d',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f5f7ff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  usernameSaveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1c3a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  usernameSaveText: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '700',
  },
  usernameCancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3a1c1c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  usernameCancelText: {
    color: '#f87171',
    fontSize: 18,
    fontWeight: '700',
  },
  usernameError: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },

  // ── Menu ────────────────────────────────────────────────────────────
  menu: {
    gap: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#141b2d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  menuIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  menuTextWrapper: {
    flex: 1,
  },
  menuTitle: {
    color: '#f5f7ff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  menuSubtitle: {
    color: '#8b98c7',
    fontSize: 13,
  },
  menuChevron: {
    color: '#8b98c7',
    fontSize: 24,
    fontWeight: '300',
  },

  // ── Bottom actions ──────────────────────────────────────────────────
  bottomActions: {
    marginTop: 'auto',
    marginBottom: 40,
    gap: 12,
  },
  signOutButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,70,70,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,70,70,0.2)',
    alignItems: 'center',
  },
  signOutText: {
    color: '#ff5252',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteAccountButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.15)',
    alignItems: 'center',
  },
  deleteAccountText: {
    color: '#d32f2f',
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Empty state ─────────────────────────────────────────────────────
  emptyText: {
    color: '#91a0c7',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
});
