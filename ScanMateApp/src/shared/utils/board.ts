import type {Square} from 'chess.js';
import {FILES} from '../constants/board';

export const squareToIndices = (square: Square) => {
  const file = square[0];
  const rank = Number(square[1]);
  const col = FILES.indexOf(file as (typeof FILES)[number]);
  const row = 8 - rank;
  return {row, col};
};

export const indicesToSquare = (row: number, col: number): Square | null => {
  if (row < 0 || row > 7 || col < 0 || col > 7) {
    return null;
  }
  const file = FILES[col];
  const rank = 8 - row;
  return `${file}${rank}` as Square;
};

export const reverseSquare = (square: Square): Square => {
  const {row, col} = squareToIndices(square);
  return indicesToSquare(7 - row, 7 - col)!;
};

export const getSquareCenter = (square: Square, boardSize: number) => {
  const {row, col} = squareToIndices(square);
  const cell = boardSize / 8;
  return {x: col * cell + cell / 2, y: row * cell + cell / 2};
};
