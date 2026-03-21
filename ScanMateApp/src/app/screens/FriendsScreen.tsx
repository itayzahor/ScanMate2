import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../App';
import {useAuth} from '../context/AuthContext';
import {
  getFriends,
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  FriendUser,
  FriendshipRecord,
  FriendsData,
} from '../../services/friends';
import {ChallengeModal} from '../../ui/components/ChallengeModal';
import {sendInvite, abandonGame} from '../../services/liveGame';
import {useSocket} from '../context/SocketContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Friends'>;

const userFromRecord = (record: FriendshipRecord, myId: string): FriendUser => {
  const req = record.requester as FriendUser;
  const rec = record.recipient as FriendUser;
  // For accepted friends, return the other person
  if (req._id === myId) {
    return rec;
  }
  return req;
};

export const FriendsScreen = ({navigation, route}: Props) => {
  const {user} = useAuth();
  const {activeGame, setActiveGame} = useSocket();
  const challengeFen = (route.params as any)?.challengeFen as string | undefined;
  const [data, setData] = useState<FriendsData>({friends: [], incoming: [], outgoing: []});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  // Challenge state
  const [challengeTarget, setChallengeTarget] = useState<FriendUser | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const result = await getFriends();
      setData(result);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load friends');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleSearch = useCallback(async () => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      return;
    }
    setSearching(true);
    setSearchResults([]);
    try {
      const found = await searchUsers(trimmed);
      setSearchResults(found);
      if (found.length === 0) {
        Alert.alert('Not Found', 'No users matching that search.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleSendRequest = useCallback(async (target: FriendUser) => {
    setSendingTo(target._id);
    try {
      await sendFriendRequest(target._id);
      Alert.alert('Sent!', `Friend request sent to ${target.name}`);
      setSearchResults(prev => prev.filter(u => u._id !== target._id));
      await fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to send request');
    } finally {
      setSendingTo(null);
    }
  }, [fetchData]);

  const handleAccept = useCallback(
    async (id: string) => {
      try {
        await acceptFriendRequest(id);
        await fetchData();
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Failed to accept');
      }
    },
    [fetchData],
  );

  const handleReject = useCallback(
    async (id: string) => {
      try {
        await rejectFriendRequest(id);
        await fetchData();
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Failed to reject');
      }
    },
    [fetchData],
  );

  const handleRemove = useCallback(
    (record: FriendshipRecord) => {
      const other = userFromRecord(record, user?.id ?? '');
      Alert.alert('Remove Friend', `Remove ${other.name}?`, [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFriend(record._id);
              await fetchData();
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to remove');
            }
          },
        },
      ]);
    },
    [user, fetchData],
  );

  const handleChallenge = useCallback(async (color: 'white' | 'black') => {
    if (!challengeTarget) return;
    setChallengeLoading(true);
    try {
      await sendInvite(challengeTarget._id, color, challengeFen);
      Alert.alert('Sent!', `Challenge sent to ${challengeTarget.name}. Waiting for response…`);
      setChallengeTarget(null);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to send challenge');
    } finally {
      setChallengeLoading(false);
    }
  }, [challengeTarget, challengeFen]);

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Sign in to manage friends</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#91a0c7" />
      </View>
    );
  }

  const sections: {title: string; data: any[]; type: string}[] = [];

  if (data.incoming.length > 0) {
    sections.push({title: 'Friend Requests', data: data.incoming, type: 'incoming'});
  }
  if (data.outgoing.length > 0) {
    sections.push({title: 'Sent Requests', data: data.outgoing, type: 'outgoing'});
  }
  if (data.friends.length > 0) {
    sections.push({title: 'Friends', data: data.friends, type: 'friends'});
  }

  // Flatten into a FlatList-friendly array
  type ListItem =
    | {kind: 'header'; title: string; key: string}
    | {kind: 'row'; record: FriendshipRecord; type: string; key: string};

  const listItems: ListItem[] = [];
  for (const section of sections) {
    listItems.push({kind: 'header', title: section.title, key: `h-${section.type}`});
    for (const record of section.data) {
      listItems.push({kind: 'row', record, type: section.type, key: record._id});
    }
  }

  const renderAvatar = (u: FriendUser) =>
    u.picture ? (
      <Image source={{uri: u.picture}} style={styles.avatar} />
    ) : (
      <View style={[styles.avatar, styles.avatarPlaceholder]}>
        <Text style={styles.avatarLetter}>{u.name?.charAt(0) ?? '?'}</Text>
      </View>
    );

  const renderItem = ({item}: {item: ListItem}) => {
    if (item.kind === 'header') {
      return <Text style={styles.sectionHeader}>{item.title}</Text>;
    }

    const {record, type} = item;

    if (type === 'incoming') {
      const from = record.requester as FriendUser;
      return (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            {renderAvatar(from)}
            <View style={styles.cardTextWrapper}>
              <Text style={styles.cardName}>{from.name}</Text>
              <Text style={styles.cardEmail}>{from.email}</Text>
            </View>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => handleAccept(record._id)}>
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => handleReject(record._id)}>
              <Text style={styles.rejectText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (type === 'outgoing') {
      const to = record.recipient as FriendUser;
      return (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            {renderAvatar(to)}
            <View style={styles.cardTextWrapper}>
              <Text style={styles.cardName}>{to.name}</Text>
              <Text style={styles.cardEmail}>{to.email}</Text>
            </View>
            <Text style={styles.pendingBadge}>Pending</Text>
          </View>
        </View>
      );
    }

    // friends
    const other = userFromRecord(record, user.id);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onLongPress={() => handleRemove(record)}>
        <View style={styles.cardRow}>
          {renderAvatar(other)}
          <View style={styles.cardTextWrapper}>
            <Text style={styles.cardName}>{other.name}</Text>
            <Text style={styles.cardEmail}>{other.email}</Text>
          </View>
          <TouchableOpacity
            style={[styles.challengeBtn, activeGame && styles.challengeBtnDisabled]}
            disabled={!!activeGame}
            onPress={() => setChallengeTarget(other)}>
            <Text style={styles.challengeIcon}>⚔️</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Friends</Text>

      {/* Active game banner */}
      {activeGame && (activeGame.status === 'active' || activeGame.status === 'pending') && (
        <TouchableOpacity
          style={styles.activeGameBanner}
          onPress={() => {
            if (activeGame.status === 'active') {
              navigation.navigate('FriendGame' as any, {gameId: activeGame._id});
            }
          }}
          onLongPress={() => {
            Alert.alert(
              'Abandon Game?',
              'This will count as a resignation. Are you sure?',
              [
                {text: 'Cancel', style: 'cancel'},
                {
                  text: 'Abandon',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await abandonGame();
                      setActiveGame(null);
                    } catch (err: any) {
                      Alert.alert('Error', err.message ?? 'Failed to abandon game');
                    }
                  },
                },
              ],
            );
          }}>
          <Text style={styles.activeGameText}>
            ⚔️ Game in progress vs{' '}
            {activeGame.whitePlayer._id === user?.id
              ? activeGame.blackPlayer.name
              : activeGame.whitePlayer.name}
          </Text>
          {activeGame.status === 'active' && (
            <Text style={styles.continueText}>Continue →</Text>
          )}
          {activeGame.status === 'pending' && (
            <Text style={styles.pendingGameText}>Waiting for response…</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email…"
          placeholderTextColor="#6b7a9e"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={[styles.searchBtn, (searchQuery.trim().length < 2 || searching) && styles.searchBtnDisabled]}
          disabled={searchQuery.trim().length < 2 || searching}
          onPress={handleSearch}>
          {searching ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.searchBtnText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Search results */}
      {searchResults.length > 0 && (
        <View style={styles.searchResultsWrapper}>
          {searchResults.map(u => (
            <View key={u._id} style={styles.searchResultCard}>
              <View style={styles.cardRow}>
                {renderAvatar(u)}
                <View style={styles.cardTextWrapper}>
                  <Text style={styles.cardName}>{u.name}</Text>
                  <Text style={styles.cardEmail}>{u.email}</Text>
                </View>
                <TouchableOpacity
                  style={styles.addFriendBtn}
                  disabled={sendingTo === u._id}
                  onPress={() => handleSendRequest(u)}>
                  {sendingTo === u._id ? (
                    <ActivityIndicator color="#4ade80" size="small" />
                  ) : (
                    <Text style={styles.addFriendIcon}>👤+</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={listItems}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        contentContainerStyle={listItems.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#91a0c7" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>No friends yet</Text>
            <Text style={styles.emptySubtext}>
              Search by email to send a friend request
            </Text>
          </View>
        }
      />

      <ChallengeModal
        visible={!!challengeTarget}
        friend={challengeTarget}
        startingFen={challengeFen}
        onSend={handleChallenge}
        onCancel={() => setChallengeTarget(null)}
        loading={challengeLoading}
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
    marginBottom: 16,
  },
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
  // Search
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
  // List
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
  // Action buttons
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
  // Empty
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
