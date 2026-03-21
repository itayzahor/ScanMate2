// services/liveGame.ts — Socket.io client + REST helpers for live games
import {Platform} from 'react-native';
import {io, Socket} from 'socket.io-client';
import {getToken} from './auth';

// ── Server URL (same LAN_HOST pattern as other services) ───────────
const LAN_HOST = '192.168.68.108';
const LAN_USER_URL = LAN_HOST ? `http://${LAN_HOST}:4000` : null;

const DEFAULT_USER_URL = Platform.select({
  android: 'http://10.0.2.2:4000',
  ios: 'http://localhost:4000',
  default: 'http://localhost:4000',
});

const USER_API_URL = LAN_USER_URL ?? DEFAULT_USER_URL ?? 'http://localhost:4000';

// ── Types ──────────────────────────────────────────────────────────
export type LiveGamePlayer = {
  _id: string;
  name: string;
  email: string;
  picture: string | null;
};

export type LiveGame = {
  _id: string;
  whitePlayer: LiveGamePlayer;
  blackPlayer: LiveGamePlayer;
  status: 'pending' | 'active' | 'completed' | 'declined';
  moves: string[];
  startingFen: string;
  currentFen: string;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  drawOfferedBy: string | null;
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type GameInvite = {
  gameId: string;
  inviter: LiveGamePlayer;
  color: 'white' | 'black'; // the recipient's color
  startingFen: string;
};

export type MoveResult = {
  gameId: string;
  san: string;
  fen: string;
  from: string;
  to: string;
  gameOver: boolean;
  result: string | null;
};

export type GameOverPayload = {
  gameId: string;
  result: string;
  reason: 'checkmate' | 'stalemate' | 'draw' | 'resign';
};

// ── Socket singleton ───────────────────────────────────────────────
let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  socket = io(USER_API_URL, {
    auth: {token},
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  return new Promise((resolve, reject) => {
    const s = socket!;
    s.on('connect', () => {
      console.log('[socket] connected', s.id);
      resolve(s);
    });
    s.on('connect_error', (err) => {
      console.error('[socket] connect_error', err.message);
      reject(err);
    });
  });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ── Emitters (with ack) ────────────────────────────────────────────
function emit<T = any>(event: string, data: any): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Socket not connected'));
    socket.emit(event, data, (res: any) => {
      if (res?.ok) resolve(res);
      else reject(new Error(res?.error ?? 'Socket event failed'));
    });
  });
}

export function sendInvite(recipientId: string, color: 'white' | 'black', startingFen?: string) {
  return emit<{ok: true; gameId: string}>('game:invite', {recipientId, color, startingFen});
}

export function respondToInvite(gameId: string, accept: boolean) {
  return emit('game:invite:respond', {gameId, accept});
}

export function sendMove(gameId: string, from: string, to: string, promotion?: string) {
  return emit<{ok: true} & MoveResult>('game:move', {gameId, from, to, promotion});
}

export function sendResign(gameId: string) {
  return emit('game:resign', {gameId});
}

export function offerDraw(gameId: string) {
  return emit('game:draw:offer', {gameId});
}

export function respondToDraw(gameId: string, accept: boolean) {
  return emit('game:draw:respond', {gameId, accept});
}

// ── Event listeners ────────────────────────────────────────────────
export function onGameInvited(cb: (data: GameInvite) => void) {
  socket?.on('game:invited', cb);
  return () => { socket?.off('game:invited', cb); };
}

export function onGameStarted(cb: (data: {game: LiveGame}) => void) {
  socket?.on('game:started', cb);
  return () => { socket?.off('game:started', cb); };
}

export function onGameMoved(cb: (data: MoveResult) => void) {
  socket?.on('game:moved', cb);
  return () => { socket?.off('game:moved', cb); };
}

export function onGameOver(cb: (data: GameOverPayload) => void) {
  socket?.on('game:over', cb);
  return () => { socket?.off('game:over', cb); };
}

export function onDrawOffered(cb: (data: {gameId: string}) => void) {
  socket?.on('game:draw:offered', cb);
  return () => { socket?.off('game:draw:offered', cb); };
}

export function onDrawDeclined(cb: (data: {gameId: string}) => void) {
  socket?.on('game:draw:declined', cb);
  return () => { socket?.off('game:draw:declined', cb); };
}

export function onGameDeclined(cb: (data: {gameId: string}) => void) {
  socket?.on('game:declined', cb);
  return () => { socket?.off('game:declined', cb); };
}

// ── REST helpers (for reconnection) ────────────────────────────────
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

export async function getActiveGame(): Promise<LiveGame | null> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/live-games/active`, {headers});
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error ?? 'Failed to fetch active game');
  return json.game;
}

export async function getGameState(gameId: string): Promise<LiveGame> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/live-games/${encodeURIComponent(gameId)}`, {headers});
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error ?? 'Failed to fetch game');
  return json.game;
}

export async function abandonGame(): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${USER_API_URL}/api/live-games/abandon`, {
    method: 'POST',
    headers,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error ?? 'Failed to abandon game');
}
