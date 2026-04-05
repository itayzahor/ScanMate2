/**
 * FriendGameScreen.tsx — Real-time chess game between friends.
 *
 * Responsibilities:
 *  - Loads a live game session from the server by gameId.
 *  - Connects to socket events for moves, game-over, draw offers/declines.
 *  - Renders the board from the correct perspective (white/black),
 *    only enabling gestures on the player's own turn.
 *  - Provides resign, draw-offer, save, and post-game review flows.
 *  - Supports in-game move review (tap a move chip to jump back,
 *    tap "Live" to return to the current position).
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import Chessboard, {ChessboardRef} from 'react-native-chessboard';
import {Chess} from 'chess.js';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../shared/types/navigation';
import {useAuth} from '../context/AuthContext';
import {useSocket} from '../context/SocketContext';
import {getBoardSize} from '../../shared/constants/layout';
import {
  sendMove,
  sendResign,
  offerDraw,
  respondToDraw,
  onGameMoved,
  onGameOver,
  onDrawOffered,
  onDrawDeclined,
  getGameState,
  LiveGame,
  LiveGamePlayer,
  MoveResult,
  GameOverPayload,
} from '../../services/liveGame';
import {saveGame} from '../../services/games';
import type {GameSnapshot} from '../../shared/types/game';
import { useRenderPiece } from '../../shared/hooks/useRenderPiece';
import {styles} from '../../ui/styles/FriendGame.styles';

// ── Types ────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'FriendGame'>;

// ── Component ────────────────────────────────────────────────────────

/**
 * Live multiplayer chess screen.
 *
 * Fetches the game state on mount, subscribes to real-time socket
 * events, and manages the full lifecycle: playing → resign/draw →
 * game-over → review/save.
 */
export const FriendGameScreen = ({navigation, route}: Props) => {
  const {gameId} = route.params as {gameId: string};
  const {user} = useAuth();
  const {setActiveGame} = useSocket();
  const boardSize = useMemo(() => getBoardSize(), []);
  const chessboardRef = useRef<ChessboardRef>(null);
  const moveScrollRef = useRef<ScrollView>(null);

  // ── Game state ───────────────────────────────────────────────────

  const [game, setGame] = useState<LiveGame | null>(null);
  /** Local chess.js instance kept in sync with the server FEN. */
  const [chess, setChess] = useState<Chess | null>(null);
  const [fen, setFen] = useState<string>('');
  const [moves, setMoves] = useState<string[]>([]);
  /** When non-null the board shows a past position (move review). */
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [gameOverReason, setGameOverReason] = useState<string | null>(null);
  const [drawPending, setDrawPending] = useState(false);
  const [loadingGame, setLoadingGame] = useState(true);

  // ── Derived values ───────────────────────────────────────────────

  /** Which color the local player controls (null if spectating). */
  const myColor: 'white' | 'black' | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.whitePlayer._id === user.id) return 'white';
    if (game.blackPlayer._id === user.id) return 'black';
    return null;
  }, [game, user]);

  /** Board is rotated 180° when the local player plays black. */
  const isFlipped = myColor === 'black';

  const opponent: LiveGamePlayer | null = useMemo(() => {
    if (!game || !myColor) return null;
    return myColor === 'white' ? game.blackPlayer : game.whitePlayer;
  }, [game, myColor]);

  const me: LiveGamePlayer | null = useMemo(() => {
    if (!game || !myColor) return null;
    return myColor === 'white' ? game.whitePlayer : game.blackPlayer;
  }, [game, myColor]);

  /** True when it's the local player's turn and the game is still active. */
  const isMyTurn = useMemo(() => {
    if (!chess || !myColor || gameOver) return false;
    const turn = chess.turn(); // 'w' or 'b'
    return (turn === 'w' && myColor === 'white') || (turn === 'b' && myColor === 'black');
  }, [chess, myColor, gameOver]);

  /** FEN to display — replays moves up to reviewIndex, or shows live FEN. */
  const currentFen = useMemo(() => {
    if (reviewIndex !== null && chess) {
      // Rebuild FEN at the review position by replaying moves
      const temp = new Chess(game?.startingFen);
      for (let i = 0; i < reviewIndex; i++) {
        temp.move(moves[i]);
      }
      return temp.fen();
    }
    return fen;
  }, [reviewIndex, chess, fen, moves, game]);

  // ── Load game on mount ───────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await getGameState(gameId);
        if (cancelled) return;
        setGame(g);
        setMoves(g.moves);
        setFen(g.currentFen);
        setResult(g.result ?? null);
        setGameOver(g.status === 'completed');

        // Replay all existing moves into a local chess.js instance
        const c = new Chess(g.startingFen);
        for (const m of g.moves) c.move(m);
        setChess(c);
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Failed to load game');
        navigation.goBack();
      } finally {
        if (!cancelled) setLoadingGame(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, navigation]);

  // ── Socket listeners ─────────────────────────────────────────────

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onGameMoved((data: MoveResult) => {
        if (data.gameId !== gameId) return;
        // Only update if FEN actually changed (avoid duplicating own move)
        setFen(prevFen => {
          if (prevFen === data.fen) return prevFen; // already applied
          return data.fen;
        });
        setMoves(prev => {
          // Guard: skip if last move already matches (de-duplication)
          if (prev.length > 0 && prev[prev.length - 1] === data.san) {
            // Check if fen matches to be sure
            return prev;
          }
          return [...prev, data.san];
        });
        setChess(() => new Chess(data.fen));
        setReviewIndex(null);
        if (data.gameOver && data.result) {
          setGameOver(true);
          setResult(data.result);
          setGameOverReason('checkmate');
        }
      }),
    );

    unsubs.push(
      onGameOver((data: GameOverPayload) => {
        if (data.gameId !== gameId) return;
        setGameOver(true);
        setResult(data.result);
        setGameOverReason(data.reason);
      }),
    );

    unsubs.push(
      onDrawOffered(({gameId: gid}) => {
        if (gid !== gameId) return;
        setDrawPending(true);
        Alert.alert('Draw Offered', 'Your opponent offers a draw.', [
          {
            text: 'Decline',
            style: 'cancel',
            onPress: () => {
              respondToDraw(gameId, false).catch(() => {});
              setDrawPending(false);
            },
          },
          {
            text: 'Accept',
            onPress: () => {
              respondToDraw(gameId, true).catch(() => {});
              setDrawPending(false);
            },
          },
        ]);
      }),
    );

    unsubs.push(
      onDrawDeclined(({gameId: gid}) => {
        if (gid !== gameId) return;
        Alert.alert('Draw Declined', 'Your opponent declined the draw offer.');
      }),
    );

    return () => unsubs.forEach(fn => fn());
  }, [gameId]);

  // Sync chessboard widget when the displayed FEN changes
  useEffect(() => {
    if (currentFen) {
      chessboardRef.current?.resetBoard(currentFen);
    }
  }, [currentFen]);

  // Auto-scroll the move strip to the latest move
  useEffect(() => {
    if (reviewIndex === null) {
      setTimeout(() => moveScrollRef.current?.scrollToEnd({animated: true}), 50);
    }
  }, [moves.length, reviewIndex]);

  // ── Snapshot builder ─────────────────────────────────────────────

  /** Replays the move list into an array of GameSnapshots for GameReview. */
  const buildSnapshots = useCallback((): GameSnapshot[] => {
    const startFen = game?.startingFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const snaps: GameSnapshot[] = [{fen: startFen, timestamp: 0}];
    const temp = new Chess(startFen);
    for (let i = 0; i < moves.length; i++) {
      temp.move(moves[i]);
      snaps.push({fen: temp.fen(), timestamp: i + 1});
    }
    return snaps;
  }, [game, moves]);

  /** Displays the game-over alert with Review / Home options. */
  const showGameOverAlert = useCallback((finalResult: string, reason?: string) => {
    let title = 'Game Over';
    let message = '';

    if (reason === 'resign') {
      message = `Game ended by resignation. Result: ${finalResult}`;
    } else if (reason === 'draw') {
      message = 'Game ended in a draw by agreement.';
    } else if (finalResult === '1/2-1/2') {
      message = 'Game ended in a draw.';
    } else {
      message = `Checkmate! Result: ${finalResult}`;
    }

    Alert.alert(title, message, [
      {
        text: 'Review Game',
        onPress: () => {
          setActiveGame(null);
          const snaps = buildSnapshots();
          navigation.replace('GameReview', {snapshots: snaps, moves, flipped: myColor === 'black'});
        },
      },
      {
        text: 'Home',
        onPress: () => {
          setActiveGame(null);
          navigation.popToTop();
        },
      },
    ]);
  }, [buildSnapshots, moves, myColor, navigation, setActiveGame]);

  // Trigger game-over alert when the game ends
  useEffect(() => {
    if (gameOver && result) {
      showGameOverAlert(result, gameOverReason ?? undefined);
    }
  }, [gameOver, result, gameOverReason, showGameOverAlert]);

  // ── Move handler ─────────────────────────────────────────────────

  /**
   * Called when the local player drags a piece.
   * Finds the matching legal move, then emits it to the server.
   * Board state is updated optimistically; the socket event confirms.
   */
  const onMove = useCallback(
    (info: {state?: {fen?: string}}) => {
      if (!chess || !game || !isMyTurn || gameOver || reviewIndex !== null) return;

      const nextFen = info?.state?.fen;
      if (!nextFen) return;

      // Figure out what move was made by comparing positions
      const tempBefore = new Chess(fen);
      const legalMoves = tempBefore.moves({verbose: true});
      const tempAfter = new Chess(nextFen);

      // Find the legal move leading to nextFen
      const match = legalMoves.find(m => {
        const t = new Chess(fen);
        t.move(m);
        return t.fen() === tempAfter.fen();
      });

      if (!match) {
        // Revert — illegal move
        chessboardRef.current?.resetBoard(fen);
        return;
      }

      // Emit to server — board update arrives via game:moved socket event
      sendMove(gameId, match.from, match.to, match.promotion)
        .catch(err => {
          // Revert board
          chessboardRef.current?.resetBoard(fen);
          Alert.alert('Move Error', err.message ?? 'Move rejected');
        });
    },
    [chess, game, isMyTurn, gameOver, reviewIndex, fen, gameId],
  );

  // ── Game-action handlers ─────────────────────────────────────────

  /** Confirms and sends a resignation to the server. */
  const handleResign = useCallback(() => {
    Alert.alert('Resign', 'Are you sure you want to resign?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Resign',
        style: 'destructive',
        onPress: () => {
          sendResign(gameId)
            .then((res: any) => {
              setGameOver(true);
              setResult(res.result);
              setGameOverReason('resign');
            })
            .catch(err => {
              Alert.alert('Error', err.message ?? 'Resign failed');
            });
        },
      },
    ]);
  }, [gameId]);

  /** Confirms and sends a draw offer. */
  const handleDrawOffer = useCallback(() => {
    Alert.alert('Offer Draw', 'Send a draw offer to your opponent?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Offer Draw',
        onPress: () => {
          offerDraw(gameId).catch(err => {
            Alert.alert('Error', err.message ?? 'Draw offer failed');
          });
        },
      },
    ]);
  }, [gameId]);

  /** Saves the game to the user's library. */
  const handleSaveGame = useCallback(async () => {
    try {
      await saveGame({
        title: `vs ${opponent?.name ?? 'Opponent'} – ${new Date().toLocaleDateString()}`,
        moves,
        startingFen: game?.startingFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        finalFen: fen,
        result: result ?? undefined,
        source: 'remote',
        opponentName: opponent?.name ?? '',
      });
      Alert.alert('Saved!', 'Game saved to your library.');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to save');
    }
  }, [moves, game, fen, result, opponent]);

  /** Clears the active game and returns to the home screen. */
  const handleGoHome = useCallback(() => {
    setActiveGame(null);
    navigation.popToTop();
  }, [navigation, setActiveGame]);

  // ── Render helpers ───────────────────────────────────────────────

  const renderPiece = useRenderPiece(boardSize, isFlipped);

  /** Renders a player info bar (avatar + name + turn badge). */
  const renderPlayerBar = (player: LiveGamePlayer | null, isTop: boolean) => (
    <View style={[styles.playerBar, isTop && styles.playerBarTop]}>
      {player?.picture ? (
        <Image source={{uri: player.picture}} style={styles.playerAvatar} />
      ) : (
        <View style={[styles.playerAvatar, styles.playerAvatarPlaceholder]}>
          <Text style={styles.playerAvatarLetter}>{player?.name?.charAt(0) ?? '?'}</Text>
        </View>
      )}
      <Text style={styles.playerName} numberOfLines={1}>
        {player?.username ? `@${player.username}` : player?.name ?? 'Unknown'}
      </Text>
      {!isTop && isMyTurn && !gameOver && (
        <Text style={styles.turnBadge}>Your turn</Text>
      )}
      {isTop && !isMyTurn && !gameOver && chess && (
        <Text style={styles.turnBadge}>Their turn</Text>
      )}
    </View>
  );

  /** Formats a SAN string with move number prefix for white's moves. */
  const formatMoveLabel = (san: string, idx: number) => {
    const moveNum = Math.floor(idx / 2) + 1;
    if (idx % 2 === 0) return `${moveNum}. ${san}`;
    return san;
  };

  // ── Loading state ────────────────────────────────────────────────

  if (loadingGame || !game || !chess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#91a0c7" />
          <Text style={styles.loadingText}>Loading game…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ──────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back button and result badge */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        {gameOver && result && (
          <Text style={styles.resultText}>{result}</Text>
        )}
      </View>

      {/* Opponent bar (top) */}
      {renderPlayerBar(opponent, true)}

      {/* Chess board — flipped for black, gestures only on own turn */}
      <View
        style={[
          styles.boardWrapper,
          {width: boardSize, height: boardSize},
          isFlipped && {transform: [{rotate: '180deg'}]},
        ]}>
        <Chessboard
          ref={chessboardRef}
          fen={currentFen}
          gestureEnabled={reviewIndex === null && isMyTurn && !gameOver}
          onMove={reviewIndex === null && isMyTurn && !gameOver ? onMove : undefined}
          boardSize={boardSize}
          renderPiece={renderPiece}
        />
      </View>

      {/* My bar (bottom) — shows "Your turn" badge when applicable */}
      {renderPlayerBar(me, false)}

      {/* Move history strip — tap a chip to review, tap Live to return */}
      <ScrollView
        ref={moveScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.moveStrip}
        contentContainerStyle={styles.moveStripContent}>
        {moves.map((san, idx) => (
          <TouchableOpacity
            key={idx}
            style={[
              styles.moveChip,
              reviewIndex === idx + 1 && styles.moveChipActive,
            ]}
            onPress={() => setReviewIndex(idx + 1)}>
            <Text
              style={[
                styles.moveChipText,
                reviewIndex === idx + 1 && styles.moveChipTextActive,
              ]}>
              {formatMoveLabel(san, idx)}
            </Text>
          </TouchableOpacity>
        ))}
        {reviewIndex !== null && (
          <TouchableOpacity
            style={[styles.moveChip, styles.liveChip]}
            onPress={() => setReviewIndex(null)}>
            <Text style={styles.liveChipText}>▶ Live</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Action bar — game-over: Review/Save/Home | active: Resign/Draw */}
      <View style={styles.actionBar}>
        {gameOver ? (
          <>
            <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => {
              setActiveGame(null);
              navigation.replace('GameReview', {snapshots: buildSnapshots(), moves, flipped: myColor === 'black'});
            }}>
              <Text style={styles.actionBtnPrimaryText}>📋 Review</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnSecondary} onPress={handleSaveGame}>
              <Text style={styles.actionBtnSecondaryText}>💾 Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnSecondary} onPress={handleGoHome}>
              <Text style={styles.actionBtnSecondaryText}>🏠 Home</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.actionBtnDanger} onPress={handleResign}>
              <Text style={styles.actionBtnDangerText}>🏳️ Resign</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={handleDrawOffer}
              disabled={drawPending}>
              <Text style={styles.actionBtnSecondaryText}>
                {drawPending ? '⏳ Draw sent' : '🤝 Draw'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

