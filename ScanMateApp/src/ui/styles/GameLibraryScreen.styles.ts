import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────
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
    marginBottom: 4,
  },
  subheading: {
    color: '#91a0c7',
    fontSize: 13,
    marginBottom: 20,
  },

  // ── List ────────────────────────────────────────────────────────────
  list: {
    paddingBottom: 40,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Card ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#141b2d',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 24,
    marginRight: 12,
    color: '#f5f7ff',
  },
  cardTextWrapper: {
    flex: 1,
  },
  cardTitle: {
    color: '#f5f7ff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardSubtitle: {
    color: '#91a0c7',
    fontSize: 13,
  },

  // ── Empty state ─────────────────────────────────────────────────────
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

  // ── Footer ──────────────────────────────────────────────────────────
  footer: {
    paddingVertical: 20,
  },
});
