import type {Square} from 'chess.js';
import {FILES} from '../constants/board';

/**
 * Convert a chess square notation (e.g. `"e4"`) into zero-based board array indices.
 * - `row` 0 = rank 8 (top of the board from white's perspective).
 * - `col` 0 = file a (left of the board from white's perspective).
 *
 * @param square - A valid chess.js `Square` (e.g. `"a1"`, `"h8"`).
 * @returns `{row, col}` indices into an 8×8 board array.
 */
export const squareToIndices = (square: Square) => {
  const file = square[0];
  const rank = Number(square[1]);
  const col = FILES.indexOf(file as (typeof FILES)[number]);
  const row = 8 - rank; // rank 8 → row 0, rank 1 → row 7
  return {row, col};
};

/**
 * Convert zero-based board array indices back to a chess `Square` string.
 * Returns `null` when the indices are outside the valid 0–7 range.
 *
 * @param row - Board row (0 = rank 8, 7 = rank 1).
 * @param col - Board column (0 = file a, 7 = file h).
 */
export const indicesToSquare = (row: number, col: number): Square | null => {
  if (row < 0 || row > 7 || col < 0 || col > 7) {
    return null;
  }
  const file = FILES[col];
  const rank = 8 - row;
  return `${file}${rank}` as Square;
};

/**
 * Mirror a square across the centre of the board.
 * Used when rendering from black's perspective to map a white-side square to its
 * black-side equivalent (e.g. `"a1"` ↔ `"h8"`, `"e4"` ↔ `"d5"`).
 *
 * @param square - The square to mirror.
 * @returns The diagonally opposite square.
 */
export const reverseSquare = (square: Square): Square => {
  const {row, col} = squareToIndices(square);
  return indicesToSquare(7 - row, 7 - col)!;
};

/**
 * Calculate the pixel coordinates of the centre of a square on a rendered board.
 *
 * @param square    - The target square (e.g. `"e4"`).
 * @param boardSize - The pixel width/height of the full board.
 * @returns `{x, y}` pixel coordinates of the square's centre (top-left origin).
 */
export const getSquareCenter = (square: Square, boardSize: number) => {
  const {row, col} = squareToIndices(square);
  const cell = boardSize / 8; // size of one square in pixels
  return {x: col * cell + cell / 2, y: row * cell + cell / 2};
};
