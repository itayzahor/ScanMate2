// context/SocketContext.tsx — Global socket connection + incoming invite handling
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {ReactNode} from 'react';
import {Alert} from 'react-native';
import {useAuth} from './AuthContext';
import {
  connectSocket,
  disconnectSocket,
  onGameInvited,
  onGameStarted,
  onGameDeclined,
  respondToInvite,
  getActiveGame,
  LiveGame,
  GameInvite,
} from '../../services/liveGame';
import type {NavigationContainerRef} from '@react-navigation/native';
import type {RootStackParamList} from '../../../App';

type SocketState = {
  connected: boolean;
  activeGame: LiveGame | null;
  setActiveGame: (g: LiveGame | null) => void;
};

const SocketContext = createContext<SocketState>({
  connected: false,
  activeGame: null,
  setActiveGame: () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

/** Must be set by App.tsx so we can navigate from the context */
export let navigationRef: NavigationContainerRef<RootStackParamList> | null = null;

export function setNavigationRef(ref: NavigationContainerRef<RootStackParamList> | null) {
  navigationRef = ref;
}

export function SocketProvider({children}: {children: ReactNode}) {
  const {user, token} = useAuth();
  const [connected, setConnected] = useState(false);
  const [activeGame, setActiveGame] = useState<LiveGame | null>(null);
  const cleanupRef = useRef<Array<() => void>>([]);

  // Connect / disconnect socket based on auth state
  useEffect(() => {
    if (!user || !token) {
      disconnectSocket();
      setConnected(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const sock = await connectSocket();
        if (cancelled) {
          disconnectSocket();
          return;
        }
        setConnected(true);

        // Check for an existing active/pending game on reconnect
        try {
          const existing = await getActiveGame();
          if (existing && !cancelled) setActiveGame(existing);
        } catch {}

        // ── Global event listeners ─────────────────────────────────
        const unsubs: Array<() => void> = [];

        // Incoming invite
        unsubs.push(
          onGameInvited((invite: GameInvite) => {
            Alert.alert(
              'Game Challenge!',
              `${invite.inviter.name} wants to play (you are ${invite.color})`,
              [
                {
                  text: 'Decline',
                  style: 'cancel',
                  onPress: () => {
                    respondToInvite(invite.gameId, false).catch(() => {});
                  },
                },
                {
                  text: 'Accept',
                  onPress: () => {
                    respondToInvite(invite.gameId, true).catch(() => {});
                    // Navigation happens via game:started event
                  },
                },
              ],
            );
          }),
        );

        // Game started (both inviter and invitee)
        unsubs.push(
          onGameStarted(({game}) => {
            setActiveGame(game);
            if (navigationRef?.isReady()) {
              navigationRef.navigate('FriendGame' as any, {gameId: game._id});
            }
          }),
        );

        // Invite declined
        unsubs.push(
          onGameDeclined(() => {
            Alert.alert('Declined', 'Your game invitation was declined.');
          }),
        );

        sock.on('disconnect', () => {
          if (!cancelled) setConnected(false);
        });
        sock.on('connect', () => {
          if (!cancelled) setConnected(true);
        });

        cleanupRef.current = unsubs;
      } catch (err) {
        console.error('[SocketProvider] connect failed', err);
      }
    })();

    return () => {
      cancelled = true;
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
      disconnectSocket();
      setConnected(false);
    };
  }, [user, token]);

  return (
    <SocketContext.Provider value={{connected, activeGame, setActiveGame}}>
      {children}
    </SocketContext.Provider>
  );
}
