import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../shared/types/navigation';
import {getGames, deleteGame, SavedGame} from '../../services/games';
import {Chess} from 'chess.js';
import type {GameSnapshot} from '../../shared/types/game';

type Props = NativeStackScreenProps<RootStackParamList, 'GameLibrary'>;

const PAGE_SIZE = 20;

export const GameLibraryScreen = ({navigation}: Props) => {
  const [games, setGames] = useState<SavedGame[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchGames(0);
    setRefreshing(false);
  }, [fetchGames]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || games.length >= total) {
      return;
    }
    setLoadingMore(true);
    await fetchGames(games.length, true);
    setLoadingMore(false);
  }, [loadingMore, games.length, total, fetchGames]);

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

  const handlePress = useCallback(
    (game: SavedGame) => {
      if (game.moves && game.moves.length > 0) {
        // Replay as GameReview
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
        // Position only → Analysis
        navigation.navigate('Analysis', {fen: game.startingFen});
      }
    },
    [navigation],
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
  };

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

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Game Library</Text>
      <Text style={styles.subheading}>
        {total} saved item{total !== 1 ? 's' : ''} · Long press to delete
      </Text>

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

const styles = StyleSheet.create({
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
  list: {
    paddingBottom: 40,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  footer: {
    paddingVertical: 20,
  },
});
