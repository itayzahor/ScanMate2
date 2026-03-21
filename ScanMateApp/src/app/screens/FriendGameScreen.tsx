// FriendGameScreen.tsx — Real-time chess game between friends
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ImageSourcePropType,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import Chessboard, {ChessboardRef} from 'react-native-chessboard';
import {Chess, PieceSymbol, Color} from 'chess.js';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../App';
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

// ── Piece assets (same as Analysis.tsx) ────────────────────────────
const PIECE_ASSETS: Record<`${Color}${PieceSymbol}`, ImageSourcePropType> = {
  wp: require('react-native-chessboard/src/assets/wp.png'),
  wn: require('react-native-chessboard/src/assets/wn.png'),
  wb: require('react-native-chessboard/src/assets/wb.png'),
  wr: require('react-native-chessboard/src/assets/wr.png'),
  wq: require('react-native-chessboard/src/assets/wq.png'),
  wk: require('react-native-chessboard/src/assets/wk.png'),
  bp: require('react-native-chessboard/src/assets/bp.png'),
  bn: require('react-native-chessboard/src/assets/bn.png'),
  bb: require('react-native-chessboard/src/assets/bb.png'),
  br: require('react-native-chessboard/src/assets/br.png'),
  bq: require('react-native-chessboard/src/assets/bq.png'),
  bk: require('react-native-chessboard/src/assets/bk.png'),
};

type Props = NativeStackScreenProps<RootStackParamList, 'FriendGame'>;

export const FriendGameScreen = ({navigation, route}: Props) => {
  const {gameId} = route.params as {gameId: string};
  const {user} = useAuth();
  const {setActiveGame} = useSocket();
  const boardSize = useMemo(() => getBoardSize(), []);
  const chessboardRef = useRef<ChessboardRef>(null);
  const moveScrollRef = useRef<ScrollView>(null);

  // Game state
  const [game, setGame] = useState<LiveGame | null>(null);
  const [chess, setChess] = useState<Chess | null>(null);
  const [fen, setFen] = useState<string>('');
  const [moves, setMoves] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null); // null = live
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [gameOverReason, setGameOverReason] = useState<string | null>(null);
  const [drawPending, setDrawPending] = useState(false);
  const [loadingGame, setLoadingGame] = useState(true);

  // Derived
  const myColor: 'white' | 'black' | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.whitePlayer._id === user.id) return 'white';
    if (game.blackPlayer._id === user.id) return 'black';
    return null;
  }, [game, user]);

  const isFlipped = myColor === 'black';

  const opponent: LiveGamePlayer | null = useMemo(() => {
    if (!game || !myColor) return null;
    return myColor === 'white' ? game.blackPlayer : game.whitePlayer;
  }, [game, myColor]);

  const me: LiveGamePlayer | null = useMemo(() => {
    if (!game || !myColor) return null;
    return myColor === 'white' ? game.whitePlayer : game.blackPlayer;
  }, [game, myColor]);

  const isMyTurn = useMemo(() => {
    if (!chess || !myColor || gameOver) return false;
    const turn = chess.turn(); // 'w' or 'b'
    return (turn === 'w' && myColor === 'white') || (turn === 'b' && myColor === 'black');
  }, [chess, myColor, gameOver]);

  const currentFen = useMemo(() => {
    if (reviewIndex !== null && chess) {
      // Rebuild fen at reviewIndex by replaying moves
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
        // Only update if fen actually changed (avoid duplicating own move)
        setFen(prevFen => {
          if (prevFen === data.fen) return prevFen; // already applied
          return data.fen;
        });
        setMoves(prev => {
          // Guard: skip if last move already matches
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

  // Update chessboard when fen changes
  useEffect(() => {
    if (currentFen) {
      chessboardRef.current?.resetBoard(currentFen);
    }
  }, [currentFen]);

  // Scroll move list to end on new moves
  useEffect(() => {
    if (reviewIndex === null) {
      setTimeout(() => moveScrollRef.current?.scrollToEnd({animated: true}), 50);
    }
  }, [moves.length, reviewIndex]);

  // ── Build snapshots from moves for GameReview ───────────────────
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

  // Show game over alert when the game ends
  useEffect(() => {
    if (gameOver && result) {
      showGameOverAlert(result, gameOverReason ?? undefined);
    }
  }, [gameOver, result, gameOverReason, showGameOverAlert]);

  // ── Handlers ─────────────────────────────────────────────────────
  const onMove = useCallback(
    (info: {state?: {fen?: string}}) => {
      if (!chess || !game || !isMyTurn || gameOver || reviewIndex !== null) return;

      const nextFen = info?.state?.fen;
      if (!nextFen) return;

      // Figure out what move was made by comparing positions
      const tempBefore = new Chess(fen);
      const legalMoves = tempBefore.moves({verbose: true});
      const tempAfter = new Chess(nextFen);

      // Find the legal move that leads to nextFen
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

      // Emit to server — state update comes via game:moved event
      sendMove(gameId, match.from, match.to, match.promotion)
        .catch(err => {
          // Revert board
          chessboardRef.current?.resetBoard(fen);
          Alert.alert('Move Error', err.message ?? 'Move rejected');
        });
    },
    [chess, game, isMyTurn, gameOver, reviewIndex, fen, gameId],
  );

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

  const handleGoHome = useCallback(() => {
    setActiveGame(null);
    navigation.popToTop();
  }, [navigation, setActiveGame]);

  // ── Render helpers ───────────────────────────────────────────────
  const renderPiece = useCallback(
    (piece: `${string}${PieceSymbol}`) => {
      const assetKey = (piece as keyof typeof PIECE_ASSETS) ?? 'wp';
      const source = PIECE_ASSETS[assetKey] ?? PIECE_ASSETS.wp;
      return (
        <Image
          source={source}
          style={{
            width: boardSize / 8,
            height: boardSize / 8,
            transform: [{rotate: isFlipped ? '180deg' : '0deg'}],
          }}
          resizeMode="contain"
        />
      );
    },
    [boardSize, isFlipped],
  );

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
        {player?.name ?? 'Unknown'}
      </Text>
      {!isTop && isMyTurn && !gameOver && (
        <Text style={styles.turnBadge}>Your turn</Text>
      )}
      {isTop && !isMyTurn && !gameOver && chess && (
        <Text style={styles.turnBadge}>Their turn</Text>
      )}
    </View>
  );

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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
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

      {/* Chess board */}
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

      {/* My bar (bottom) */}
      {renderPlayerBar(me, false)}

      {/* Move history */}
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

      {/* Action bar */}
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

// ── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c111d',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#91a0c7',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backText: {
    color: '#91a0c7',
    fontSize: 16,
  },
  resultText: {
    color: '#f0ad4e',
    fontSize: 18,
    fontWeight: '800',
  },
  // Player bars
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  playerBarTop: {},
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  playerAvatarPlaceholder: {
    backgroundColor: '#1c2b4b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerAvatarLetter: {
    color: '#f5f7ff',
    fontSize: 14,
    fontWeight: '700',
  },
  playerName: {
    color: '#f5f7ff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  turnBadge: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  // Board
  boardWrapper: {
    alignSelf: 'center',
    marginVertical: 4,
  },
  // Move strip
  moveStrip: {
    maxHeight: 40,
    marginHorizontal: 16,
    marginTop: 4,
  },
  moveStripContent: {
    alignItems: 'center',
    gap: 4,
    paddingRight: 12,
  },
  moveChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#141b2d',
  },
  moveChipActive: {
    backgroundColor: '#1c3a2a',
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  moveChipText: {
    color: '#91a0c7',
    fontSize: 13,
    fontWeight: '500',
  },
  moveChipTextActive: {
    color: '#4ade80',
  },
  liveChip: {
    backgroundColor: '#1c2b4b',
  },
  liveChipText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '700',
  },
  // Action bar
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  actionBtnPrimary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4ade80',
  },
  actionBtnPrimaryText: {
    color: '#0c111d',
    fontSize: 14,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1c2b4b',
  },
  actionBtnSecondaryText: {
    color: '#f5f7ff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnDanger: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#3a1c1c',
  },
  actionBtnDangerText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '700',
  },
});
