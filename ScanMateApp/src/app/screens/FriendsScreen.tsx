/**
 * FriendsScreen.tsx — Friends list, search, requests, and challenge screen.
 *
 * Responsibilities:
 *  - Displays the user's accepted friends, incoming requests, and
 *    outgoing (pending) requests in a single sectioned FlatList.
 *  - Provides a username search bar to find and send new friend requests.
 *  - Each friend card has remove and challenge (⚔️) actions.
 *  - Shows an active-game banner if a live game is in progress, with
 *    options to continue, abandon, or cancel a pending invite.
 *  - Opens a ChallengeModal to pick color before sending a game invite.
 *  - Supports an optional challengeFen route param to pre-fill the
 *    starting position when challenging from the Analysis/GameReview screen.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../shared/types/navigation';
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
import {sendInvite, abandonGame, cancelInvite} from '../../services/liveGame';
import {useSocket} from '../context/SocketContext';
import {styles} from '../../ui/styles/FriendsScreen.styles';

// ── Helpers ──────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Friends'>;

/**
 * Extracts the "other" user from a FriendshipRecord.
 * If the current user is the requester, returns the recipient and vice-versa.
 */
const userFromRecord = (record: FriendshipRecord, myId: string): FriendUser => {
  const req = record.requester as FriendUser;
  const rec = record.recipient as FriendUser;
  if (req._id === myId) {
    return rec;
  }
  return req;
};

// ── Component ────────────────────────────────────────────────────────

/**
 * Social hub screen — browse friends, manage requests, search users,
 * and send game challenges.
 */
export const FriendsScreen = ({navigation, route}: Props) => {
  const {user} = useAuth();
  const {activeGame, setActiveGame} = useSocket();
  /** Optional FEN passed from Analysis/GameReview to pre-fill a challenge. */
  const challengeFen = (route.params as any)?.challengeFen as string | undefined;

  // ── Data state ──────────────────────────────────────────────────

  const [data, setData] = useState<FriendsData>({friends: [], incoming: [], outgoing: []});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Search state ────────────────────────────────────────────────

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [searching, setSearching] = useState(false);
  /** ID of the user currently receiving a friend request (loading guard). */
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  // ── Challenge state ─────────────────────────────────────────────

  const [challengeTarget, setChallengeTarget] = useState<FriendUser | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);

  // ── Data fetching ───────────────────────────────────────────────

  /** Loads friends, incoming, and outgoing requests from the server. */
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

  /** Pull-to-refresh handler. */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ── Search handlers ─────────────────────────────────────────────

  /** Searches users by username (min 2 characters). */
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

  /** Sends a friend request and removes the user from search results. */
  const handleSendRequest = useCallback(async (target: FriendUser) => {
    setSendingTo(target._id);
    try {
      await sendFriendRequest(target._id);
      Alert.alert('Sent!', `Friend request sent to @${target.username ?? target.name}`);
      setSearchResults(prev => prev.filter(u => u._id !== target._id));
      await fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to send request');
    } finally {
      setSendingTo(null);
    }
  }, [fetchData]);

  // ── Friend-request handlers ─────────────────────────────────────

  /** Accepts an incoming friend request. */
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

  /** Rejects an incoming friend request. */
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

  /** Confirms and removes an existing friend. */
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

  // ── Challenge handler ───────────────────────────────────────────

  /** Sends a game invite with the chosen color (and optional starting FEN). */
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

  // ── Early returns ───────────────────────────────────────────────

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

  // ── List data preparation ───────────────────────────────────────

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

  // Flatten sections into a FlatList-friendly array with header items
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

  // ── Render helpers ──────────────────────────────────────────────

  /** Renders a user avatar (Google picture or initial letter fallback). */
  const renderAvatar = (u: FriendUser) =>
    u.picture ? (
      <Image source={{uri: u.picture}} style={styles.avatar} />
    ) : (
      <View style={[styles.avatar, styles.avatarPlaceholder]}>
        <Text style={styles.avatarLetter}>{u.name?.charAt(0) ?? '?'}</Text>
      </View>
    );

  /** Renders a single list item (section header or user card). */
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
              <Text style={styles.cardEmail}>@{from.username ?? from.email}</Text>
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
              <Text style={styles.cardEmail}>@{to.username ?? to.email}</Text>
            </View>
            <Text style={styles.pendingBadge}>Pending</Text>
          </View>
        </View>
      );
    }

    // Accepted friends — show remove + challenge buttons
    const other = userFromRecord(record, user.id);
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          {renderAvatar(other)}
          <View style={styles.cardTextWrapper}>
            <Text style={styles.cardName}>{other.name}</Text>
            <Text style={styles.cardEmail}>@{other.username ?? other.email}</Text>
          </View>
          <TouchableOpacity
            style={styles.removeFriendBtn}
            onPress={() => handleRemove(record)}>
            <Text style={styles.removeFriendIcon}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.challengeBtn, activeGame && styles.challengeBtnDisabled]}
            disabled={!!activeGame}
            onPress={() => setChallengeTarget(other)}>
            <Text style={styles.challengeIcon}>⚔️</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Main render ─────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Friends</Text>

      {/* Active game banner — tap to continue, long-press to abandon */}
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
              ? (activeGame.blackPlayer.username ? `@${activeGame.blackPlayer.username}` : activeGame.blackPlayer.name)
              : (activeGame.whitePlayer.username ? `@${activeGame.whitePlayer.username}` : activeGame.whitePlayer.name)}
          </Text>
          {activeGame.status === 'active' && (
            <Text style={styles.continueText}>Continue →</Text>
          )}
          {activeGame.status === 'pending' && (
            <View>
              <Text style={styles.pendingGameText}>Waiting for response…</Text>
              {activeGame.invitedBy === user?.id && (
                <TouchableOpacity
                  style={styles.cancelChallengeBtn}
                  onPress={() => {
                    Alert.alert(
                      'Cancel Challenge?',
                      'Are you sure you want to cancel this invite?',
                      [
                        {text: 'No', style: 'cancel'},
                        {
                          text: 'Cancel Invite',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await cancelInvite(activeGame._id);
                              setActiveGame(null);
                            } catch (err: any) {
                              Alert.alert('Error', err.message ?? 'Failed to cancel invite');
                            }
                          },
                        },
                      ],
                    );
                  }}>
                  <Text style={styles.cancelChallengeText}>Cancel Challenge</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Username search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username…"
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

      {/* Search results — each with an add-friend button */}
      {searchResults.length > 0 && (
        <View style={styles.searchResultsWrapper}>
          {searchResults.map(u => (
            <View key={u._id} style={styles.searchResultCard}>
              <View style={styles.cardRow}>
                {renderAvatar(u)}
                <View style={styles.cardTextWrapper}>
                  <Text style={styles.cardName}>{u.name}</Text>
                  <Text style={styles.cardEmail}>@{u.username ?? u.email}</Text>
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

      {/* Sectioned friends list (incoming / outgoing / accepted) */}
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
              Search by username to send a friend request
            </Text>
          </View>
        }
      />

      {/* Challenge color-picker modal */}
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
