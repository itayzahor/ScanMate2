/**
 * GameLibraryScreen.tsx — Paginated list of saved games and positions.
 *
 * Responsibilities:
 *  - Fetches and displays saved games from the server with infinite-scroll
 *    pagination (PAGE_SIZE items per batch).
 *  - Supports pull-to-refresh and long-press to delete.
 *  - Tapping a game with moves replays it in GameReview; tapping a
 *    position-only entry opens it in Analysis.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../shared/types/navigation';
import {getGames, deleteGame, SavedGame} from '../../services/games';
import {Chess} from 'chess.js';
import type {GameSnapshot} from '../../shared/types/game';
import {styles} from '../../ui/styles/GameLibraryScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'GameLibrary'>;

/** Number of games fetched per page. */
const PAGE_SIZE = 20;

// ── Component ────────────────────────────────────────────────────────

/**
 * Paginated game library — saved games and positions fetched from the
 * server, displayed in a scrollable list with pull-to-refresh.
 */
export const GameLibraryScreen = ({navigation}: Props) => {
  // ── State ────────────────────────────────────────────────────────

  const [games, setGames] = useState<SavedGame[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────

  /**
   * Loads a page of games from the server.
   * @param skip  Number of items already loaded (pagination offset).
   * @param append  If true, appends to existing list instead of replacing.
   */
  const fetchGames = useCallback(async (skip = 0, append = false) => {
    try {
      const result = await getGames(skip, PAGE_SIZE);
      setGames(prev => (append ? [...prev, ...result.games] : result.games));
      setTotal(result.total);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load games');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchGames(0);
      setLoading(false);
    })();
  }, [fetchGames]);

  /** Pull-to-refresh handler. */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchGames(0);
    setRefreshing(false);
  }, [fetchGames]);

  /** Infinite-scroll — loads the next page when the list nears the bottom. */
  const onEndReached = useCallback(async () => {
    if (loadingMore || games.length >= total) {
      return;
    }
    setLoadingMore(true);
    await fetchGames(games.length, true);
    setLoadingMore(false);
  }, [loadingMore, games.length, total, fetchGames]);

  // ── Handlers ─────────────────────────────────────────────────────

  /** Shows a confirmation alert, then deletes the game on the server. */
  const handleDelete = useCallback(
    (game: SavedGame) => {
      Alert.alert('Delete', `Delete "${game.title}"?`, [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGame(game._id);
              setGames(prev => prev.filter(g => g._id !== game._id));
              setTotal(prev => prev - 1);
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to delete');
            }
          },
        },
      ]);
    },
    [],
  );

  /**
   * Opens a saved game for review or analysis.
   * - Games with moves → replay in GameReview (builds snapshot array).
   * - Position-only entries → open in Analysis.
   */
  const handlePress = useCallback(
    (game: SavedGame) => {
      if (game.moves && game.moves.length > 0) {
        // Rebuild snapshot history from the move list
        const chess = new Chess(game.startingFen || undefined);
        const snapshots: GameSnapshot[] = [{fen: chess.fen(), timestamp: 0}];
        const validMoves: string[] = [];
        for (const san of game.moves) {
          const result = chess.move(san);
          if (!result) {
            break;
          }
          validMoves.push(result.san);
          snapshots.push({fen: chess.fen(), timestamp: snapshots.length});
        }
        navigation.navigate('GameReview', {snapshots, moves: validMoves});
      } else {
        // Position only → open for analysis
        navigation.navigate('Analysis', {fen: game.startingFen});
      }
    },
    [navigation],
  );

  // ── Render helpers ───────────────────────────────────────────────

  /** Formats an ISO date string into a short human-readable label. */
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
  };

  /** Renders a single game/position card with icon, title, and metadata. */
  const renderItem = ({item}: {item: SavedGame}) => {
    const isGame = item.moves && item.moves.length > 0;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => handlePress(item)}
        onLongPress={() => handleDelete(item)}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>{isGame ? '♟' : '♔'}</Text>
          <View style={styles.cardTextWrapper}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title || (isGame ? 'Untitled Game' : 'Saved Position')}
            </Text>
            <Text style={styles.cardSubtitle}>
              {isGame ? `${item.moves.length} moves` : 'Position'}
              {item.result ? ` · ${item.result}` : ''}
              {' · '}
              {formatDate(item.createdAt)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#91a0c7" />
      </View>
    );
  }

  // ── Main render ─────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Game Library</Text>
      <Text style={styles.subheading}>
        {total} saved item{total !== 1 ? 's' : ''} · Long press to delete
      </Text>

      {/* Paginated game list with pull-to-refresh and infinite scroll */}
      <FlatList
        data={games}
        keyExtractor={item => item._id}
        renderItem={renderItem}
        contentContainerStyle={games.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#91a0c7" />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyText}>No saved games yet</Text>
            <Text style={styles.emptySubtext}>
              Scan a game or save a position to see it here
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footer} color="#91a0c7" />
          ) : null
        }
      />
    </View>
  );
};
