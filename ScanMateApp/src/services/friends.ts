import {getToken} from './auth';
import {API_BASE_URL as USER_API_URL} from './config';

export type FriendUser = {
  _id: string;
  name: string;
  email: string;
  picture: string | null;
};

export type FriendshipRecord = {
  _id: string;
  requester: FriendUser | string;
  recipient: FriendUser | string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
};

export type FriendsData = {
  friends: FriendshipRecord[];
  incoming: FriendshipRecord[];
  outgoing: FriendshipRecord[];
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  if (!token) {
    throw new Error('Not signed in');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export async function getFriends(): Promise<FriendsData> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/friends`, {headers});
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to fetch friends (${res.status})`);
  }
  return {friends: json.friends, incoming: json.incoming, outgoing: json.outgoing};
}

export async function searchUsers(query: string): Promise<FriendUser[]> {
  const headers = await authHeaders();
  const res = await fetch(
    `${USER_API_URL}/api/friends/search?q=${encodeURIComponent(query)}`,
    {headers},
  );
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Search failed (${res.status})`);
  }
  return json.users ?? [];
}

export async function sendFriendRequest(recipientId: string): Promise<FriendshipRecord> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/friends/request`, {
    method: 'POST',
    headers,
    body: JSON.stringify({recipientId}),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to send request (${res.status})`);
  }
  return json.friendship;
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/friends/${encodeURIComponent(friendshipId)}/accept`, {
    method: 'POST',
    headers,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to accept (${res.status})`);
  }
}

export async function rejectFriendRequest(friendshipId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/friends/${encodeURIComponent(friendshipId)}/reject`, {
    method: 'POST',
    headers,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to reject (${res.status})`);
  }
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/friends/${encodeURIComponent(friendshipId)}`, {
    method: 'DELETE',
    headers,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to remove friend (${res.status})`);
  }
}
