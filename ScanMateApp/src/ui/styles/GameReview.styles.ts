import { StyleSheet } from 'react-native';
import { colors } from '../theme';

export const styles = StyleSheet.create({
  /* Layout */
  container:           { flex: 1, backgroundColor: colors.backgroundDark, paddingHorizontal: 16 },
  header:              { marginBottom: 8 },
  boardWrapper:        { alignSelf: 'center', borderWidth: 2, borderColor: colors.secondary, borderRadius: 8, overflow: 'hidden', marginBottom: 12 },

  /* Toolbar row */
  toolbarRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  toolbarButton:       { flex: 1, backgroundColor: '#1f1f1f', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  toolbarButtonText:   { color: '#fff', fontWeight: '600', fontSize: 14 },
  analyzeToolbarButton:{ backgroundColor: colors.primary },
  analyzeButtonDisabled:{ opacity: 0.6 },
  returnButton:        { backgroundColor: '#e67e22' },

  /* Edit mode */
  editButtonActive:    { backgroundColor: '#2e7d32' },
  truncateButton:      { backgroundColor: '#4a1a1a' },

  /* Save / Export / Challenge buttons */
  saveButton:          { backgroundColor: '#1c3a2a' },
  exportButton:        { backgroundColor: '#1c2b4b' },
  challengeButton:     { backgroundColor: '#2b1c4b' },

  /* Record row */
  recordRow:           { flexDirection: 'row', gap: 8, marginBottom: 10 },
  recordButton:        { backgroundColor: '#b71c1c' },

  /* Error */
  analysisError:       { color: '#e74c3c', marginTop: 8 },
});
