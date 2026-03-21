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
  promoteButton:       { backgroundColor: '#1a3a4a' },
  deleteButton:        { backgroundColor: '#4a1a2a' },

  /* Error */
  analysisError:       { color: '#e74c3c', marginTop: 8 },
});
