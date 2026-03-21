import {Platform} from 'react-native';
import {getToken} from './auth';

const LAN_HOST = '192.168.68.51';
const LAN_USER_URL = LAN_HOST ? `http://${LAN_HOST}:4000` : null;

const DEFAULT_USER_URL = Platform.select({
  android: 'http://10.0.2.2:4000',
  ios: 'http://localhost:4000',
  default: 'http://localhost:4000',
});

const USER_API_URL = LAN_USER_URL ?? DEFAULT_USER_URL ?? 'http://localhost:4000';

export type SavedGame = {
  _id: string;
  userId: string;
  title: string;
  moves: string[];
  startingFen: string;
  finalFen: string;
  result: string | null;
  source: 'scan' | 'remote' | 'import' | 'manual';
  opponentName: string;
  createdAt: string;
  updatedAt: string;
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

export async function saveGame(data: {
  title?: string;
  moves?: string[];
  startingFen: string;
  finalFen?: string;
  result?: string;
  source?: string;
  opponentName?: string;
}): Promise<SavedGame> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/games`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to save game (${res.status})`);
  }
  return json.game;
}

export async function getGames(
  skip = 0,
  limit = 20,
): Promise<{games: SavedGame[]; total: number}> {
  const headers = await authHeaders();
  const res = await fetch(
    `${USER_API_URL}/api/games?skip=${skip}&limit=${limit}`,
    {headers},
  );
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to fetch games (${res.status})`);
  }
  return {games: json.games, total: json.total};
}

export async function getGame(id: string): Promise<SavedGame> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/games/${encodeURIComponent(id)}`, {
    headers,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to fetch game (${res.status})`);
  }
  return json.game;
}

export async function deleteGame(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/games/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to delete game (${res.status})`);
  }
}
