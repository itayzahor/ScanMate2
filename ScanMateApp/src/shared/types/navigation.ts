import type {GameSnapshot} from './game';

export type RootStackParamList = {
  Main: undefined;
  ScanBoard: undefined;
  ScanGame: {startingFen?: string} | undefined;
  Result: {photoPath: string};
  Analysis: {fen: string};
  GameReview: {snapshots: GameSnapshot[]; moves?: string[]; flipped?: boolean};
  Profile: undefined;
  GameLibrary: undefined;
  Friends: {challengeFen?: string} | undefined;
  FriendGame: {gameId: string};
};
