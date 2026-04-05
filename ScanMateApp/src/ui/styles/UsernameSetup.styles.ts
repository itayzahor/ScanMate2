import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: '#0c111d',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: '#f5f7ff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#91a0c7',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },

  // ── Input ───────────────────────────────────────────────────────────
  input: {
    backgroundColor: '#141b2d',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f5f7ff',
    fontSize: 18,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },

  // ── Feedback text ───────────────────────────────────────────────────
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  availableText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },

  // ── Buttons ─────────────────────────────────────────────────────────
  button: {
    backgroundColor: '#1c2b4b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmButton: {
    backgroundColor: '#1c3a2a',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#f5f7ff',
    fontSize: 16,
    fontWeight: '700',
  },
});
