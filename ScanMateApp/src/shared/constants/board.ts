import type {ImageSourcePropType} from 'react-native';
import type {Square, PieceSymbol, Color} from 'chess.js';
import {PIECE_ASSETS} from './pieces';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export const BOARD_SQUARE_ROWS: Square[][] = Array.from({length: 8}, (_, rowIndex) => {
  const rank = 8 - rowIndex;
  return FILES.map(file => `${file}${rank}` as Square);
});

export type PieceOption = {
  type: PieceSymbol;
  color: Color;
  label: string;
  asset: ImageSourcePropType;
};

export const PIECE_OPTIONS: PieceOption[] = [
  {type: 'p', color: 'w', label: 'W Pawn', asset: PIECE_ASSETS.wp},
  {type: 'n', color: 'w', label: 'W Knight', asset: PIECE_ASSETS.wn},
  {type: 'b', color: 'w', label: 'W Bishop', asset: PIECE_ASSETS.wb},
  {type: 'r', color: 'w', label: 'W Rook', asset: PIECE_ASSETS.wr},
  {type: 'q', color: 'w', label: 'W Queen', asset: PIECE_ASSETS.wq},
  {type: 'k', color: 'w', label: 'W King', asset: PIECE_ASSETS.wk},
  {type: 'p', color: 'b', label: 'B Pawn', asset: PIECE_ASSETS.bp},
  {type: 'n', color: 'b', label: 'B Knight', asset: PIECE_ASSETS.bn},
  {type: 'b', color: 'b', label: 'B Bishop', asset: PIECE_ASSETS.bb},
  {type: 'r', color: 'b', label: 'B Rook', asset: PIECE_ASSETS.br},
  {type: 'q', color: 'b', label: 'B Queen', asset: PIECE_ASSETS.bq},
  {type: 'k', color: 'b', label: 'B King', asset: PIECE_ASSETS.bk},
];

export const PROMOTION_CHOICES: PieceSymbol[] = ['q', 'r', 'b', 'n'];
