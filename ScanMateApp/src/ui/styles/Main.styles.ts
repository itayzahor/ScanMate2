import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
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
