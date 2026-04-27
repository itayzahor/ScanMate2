import {Chess, Square, PieceSymbol, Color} from 'chess.js';
import {normalizeFen} from './fen';
import {squareToIndices, indicesToSquare, reverseSquare} from './board';

/**
 * Utilities for reading and mutating FEN positions at the piece level.
 *
 * The module is split into four areas:
 * 1. **Board ↔ placement helpers** – convert between FEN placement strings and 8×8 arrays.
 * 2. **Piece char helpers** – translate between single-char piece codes and typed `{type, color}` objects.
 * 3. **Pseudo-legal move generation** – generate moves in "free placement" mode (ignores check/castling).
 * 4. **`FenUtils` namespace** – higher-level FEN string mutations (flip, toggle turn, edit square, move piece).
 */

/* ── Board ↔ placement helpers ── */

/** Create an empty 8×8 board array filled with `null`. */
export const emptyBoard = () =>
  Array.from({length: 8}, () => Array(8).fill(null) as Array<string | null>);

/**
 * Parse the piece-placement segment of a FEN string into an 8×8 board array.
 * Each cell is either a piece character (e.g. `'P'` for white pawn, `'k'` for black king)
 * or `null` for an empty square. Digit characters expand into that many empty cells.
 *
 * @param placement - The first field of a FEN string (e.g. `"rnbqkbnr/pppppppp/8/..."`)
 */
export const placementToBoard = (placement: string) => {
  const rows = placement.split('/');
  const board = emptyBoard();
  rows.forEach((row, rowIndex) => {
    if (rowIndex >= 8) return;
    let colIndex = 0;
    row.split('').forEach(char => {
      if (colIndex >= 8) return;
      if (/\d/.test(char)) {
        colIndex += Number(char);
        return;
      }
      board[rowIndex][colIndex] = char;
      colIndex += 1;
    });
  });
  return board;
};

/**
 * Serialize an 8×8 board array back into a FEN piece-placement string.
 * Consecutive empty squares on a rank are collapsed into their digit count.
 * An all-empty rank is represented as `"8"`.
 *
 * @param board - An 8×8 array of piece characters or `null`.
 */
export const boardToPlacement = (board: Array<Array<string | null>>) =>
  board
    .map(row => {
      let result = '';
      let empty = 0;
      row.forEach(cell => {
        if (!cell) {
          empty += 1;
        } else {
          if (empty > 0) {
            result += String(empty);
            empty = 0;
          }
          result += cell;
        }
      });
      if (empty > 0) result += String(empty);
      return result || '8';
    })
    .join('/');

/* ── Piece char ↔ typed piece ── */

/**
 * Convert a single-character FEN piece code to a typed piece object.
 * Uppercase = white, lowercase = black (standard FEN convention).
 *
 * @param char - A single character such as `'P'`, `'k'`, `'Q'`.
 */
export const charToPiece = (char: string): {type: PieceSymbol; color: Color} => ({
  type: char.toLowerCase() as PieceSymbol,
  color: char === char.toUpperCase() ? 'w' : 'b',
});

/**
 * Convert a typed piece object back to a single FEN character.
 * White pieces are uppercase; black pieces are lowercase.
 */
export const pieceToChar = (piece: {type: PieceSymbol; color: Color}) =>
  piece.color === 'w' ? piece.type.toUpperCase() : piece.type;

/**
 * Construct a chess.js `Chess` instance from a FEN string.
 * Returns `null` instead of throwing when the FEN is invalid.
 */
export const loadChess = (fen: string): Chess | null => {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
};

/**
 * Look up the piece on a given square and return it together with the parsed board
 * and the piece's position. Returns `null` when the square is empty.
 *
 * @param fen    - Any FEN string (will be normalized internally).
 * @param square - The square to inspect.
 */
export const getBoardAndPiece = (fen: string, square: Square) => {
  const normalized = normalizeFen(fen);
  const [placement] = normalized.split(' ');
  const board = placementToBoard(placement);
  const {row, col} = squareToIndices(square);
  const cell = board[row]?.[col] ?? null;
  if (!cell) return null;
  return {
    board,
    pieceChar: cell,
    piece: charToPiece(cell),
    position: {row, col},
  };
};

/* ── Pseudo-legal move generation (free placement mode) ── */

/** A move in free-placement mode. `isFree` marks it as bypassing chess.js legality checks. */
type LogicMove = {from: Square; to: Square; promotion?: PieceSymbol; isFree?: boolean};

/**
 * Append sliding moves (bishop/rook/queen rays) to `moves` for a piece at `start`.
 * Rays extend along each direction in `deltas` until blocked by the board edge or a piece.
 * Enemy pieces are included as captures; friendly pieces stop the ray before that square.
 *
 * @param moves  - Accumulator array; results are pushed here.
 * @param board  - Current 8×8 board array.
 * @param start  - `{row, col}` of the sliding piece.
 * @param deltas - Array of `[rowDelta, colDelta]` direction vectors.
 * @param piece  - The moving piece (only `color` is used to detect friendly fire).
 */
export const collectSlidingMoves = (
  moves: LogicMove[],
  board: Array<Array<string | null>>,
  start: {row: number; col: number},
  deltas: Array<[number, number]>,
  piece: {color: Color},
) => {
  deltas.forEach(([dr, dc]) => {
    let row = start.row + dr;
    let col = start.col + dc;
    while (row >= 0 && row < 8 && col >= 0 && col < 8) {
      const occupant = board[row][col];
      if (occupant) {
        const target = charToPiece(occupant);
        if (target.color !== piece.color) {
          const sq = indicesToSquare(row, col);
          if (sq) moves.push({from: indicesToSquare(start.row, start.col)!, to: sq, isFree: true});
        }
        break;
      }
      const sq = indicesToSquare(row, col);
      if (sq) moves.push({from: indicesToSquare(start.row, start.col)!, to: sq, isFree: true});
      row += dr;
      col += dc;
    }
  });
};

/**
 * Generate all pseudo-legal destination squares for the piece on `square`.
 * Unlike chess.js, this mode ignores check, castling, and en-passant — it is used
 * in the free-placement editor where legal-move constraints would be too restrictive.
 *
 * @param fen    - Any FEN string (will be normalized internally).
 * @param square - The square whose piece should generate moves.
 * @returns Array of `LogicMove` objects (all have `isFree: true`).
 */
export const generatePseudoMoves = (fen: string, square: Square): LogicMove[] => {
  const info = getBoardAndPiece(fen, square);
  if (!info) return [];
  const {board, piece, position} = info;
  const fromSquare = indicesToSquare(position.row, position.col)!;
  const moves: LogicMove[] = [];

  const addMove = (row: number, col: number) => {
    const targetSquare = indicesToSquare(row, col);
    if (!targetSquare) return;
    const occupant = board[row]?.[col] ?? null;
    if (occupant) {
      const target = charToPiece(occupant);
      if (target.color === piece.color) return;
    }
    moves.push({from: fromSquare, to: targetSquare, isFree: true});
  };

  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? -1 : 1;
      const startRow = piece.color === 'w' ? 6 : 1;
      const nextRow = position.row + dir;
      if (nextRow >= 0 && nextRow < 8 && !board[nextRow][position.col]) {
        addMove(nextRow, position.col);
        const doubleRow = position.row === startRow ? position.row + dir * 2 : null;
        if (doubleRow !== null && doubleRow >= 0 && doubleRow < 8 && !board[doubleRow][position.col]) {
          addMove(doubleRow, position.col);
        }
      }
      [-1, 1].forEach(dc => {
        const targetCol = position.col + dc;
        const targetRow = position.row + dir;
        if (targetRow < 0 || targetRow >= 8 || targetCol < 0 || targetCol >= 8) return;
        const occupant = board[targetRow][targetCol];
        if (occupant && charToPiece(occupant).color !== piece.color) addMove(targetRow, targetCol);
      });
      break;
    }
    case 'n': {
      const offsets = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
      offsets.forEach(([dr, dc]) => {
        const row = position.row + dr;
        const col = position.col + dc;
        if (row >= 0 && row < 8 && col >= 0 && col < 8) addMove(row, col);
      });
      break;
    }
    case 'b':
      collectSlidingMoves(moves, board, position, [[1, 1], [1, -1], [-1, 1], [-1, -1]], piece);
      break;
    case 'r':
      collectSlidingMoves(moves, board, position, [[1, 0], [-1, 0], [0, 1], [0, -1]], piece);
      break;
    case 'q':
      collectSlidingMoves(moves, board, position, [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]], piece);
      break;
    case 'k':
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const row = position.row + dr;
          const col = position.col + dc;
          if (row >= 0 && row < 8 && col >= 0 && col < 8) addMove(row, col);
        }
      }
      break;
  }
  return moves;
};

/* ── FEN manipulation utilities ── */

/**
 * A namespace of higher-level FEN string operations.
 * All methods accept and return full 6-field FEN strings.
 * The input FEN is normalized before processing.
 */
export const FenUtils = {
  /**
   * Flip the board 180°: reverse the rank order, reverse each rank's file order,
   * and mirror the en-passant square if one exists.
   * Useful for rendering from black's perspective without changing side-to-move.
   */
  reverseFen: (fen: string): string => {
    const [placement, activeColor, castling, enPassant, halfMove, fullMove] = fen.split(' ');
    const reversedPlacement = placement
      .split('/')
      .reverse()
      .map(row => row.split('').reverse().join(''))
      .join('/');
    const reversedEnPassant = enPassant !== '-' ? reverseSquare(enPassant as Square) : '-';
    return `${reversedPlacement} ${activeColor} ${castling} ${reversedEnPassant} ${halfMove} ${fullMove}`;
  },

  /**
   * Toggle the active color field between `'w'` and `'b'`.
   * All other FEN fields are left unchanged.
   */
  toggleTurn: (fen: string): string => {
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    return parts.join(' ');
  },

  /**
   * Place or remove a piece on a specific square and return the updated FEN.
   * Passing `null` for `newPiece` empties the square.
   * All non-placement FEN fields (turn, castling, clocks) are preserved.
   *
   * @param currentFen - The current FEN string.
   * @param square     - The square to modify.
   * @param newPiece   - The piece to place, or `null` to clear the square.
   */
  updateSquare: (
    currentFen: string,
    square: Square,
    newPiece: {type: PieceSymbol; color: Color} | null,
  ): string => {
    const normalized = normalizeFen(currentFen);
    const [placement, ...rest] = normalized.split(' ');
    const board = placementToBoard(placement);
    const {row, col} = squareToIndices(square);
    if (!board[row]) board[row] = Array(8).fill(null);
    board[row][col] = newPiece ? pieceToChar(newPiece) : null;
    const newPlacement = boardToPlacement(board);
    return [newPlacement, ...rest].slice(0, 6).join(' ');
  },

  /**
   * Return the piece on a square, or `null` if the square is empty.
   *
   * @param currentFen - The current FEN string.
   * @param square     - The square to inspect.
   */
  getPieceAt: (currentFen: string, square: Square) => {
    const normalized = normalizeFen(currentFen);
    const [placement] = normalized.split(' ');
    const board = placementToBoard(placement);
    const {row, col} = squareToIndices(square);
    const cell = board[row]?.[col] ?? null;
    if (!cell) return null;
    return charToPiece(cell);
  },

  /**
   * Move a piece from one square to another without any legality checks
   * (free-placement mode). Optionally promotes the piece on arrival.
   * Returns the normalized current FEN unchanged when `from === to` or the
   * source square is empty.
   *
   * @param currentFen - The current FEN string.
   * @param from       - Source square.
   * @param to         - Destination square.
   * @param promotion  - Optional piece symbol to promote to on arrival.
   */
  movePieceFreely: (
    currentFen: string,
    from: Square,
    to: Square,
    promotion?: PieceSymbol,
  ): string => {
    if (from === to) return normalizeFen(currentFen);
    const normalized = normalizeFen(currentFen);
    const [placement, ...rest] = normalized.split(' ');
    const board = placementToBoard(placement);
    const fromIdx = squareToIndices(from);
    const toIdx = squareToIndices(to);
    const piece = board[fromIdx.row]?.[fromIdx.col];
    if (!piece) return normalized;
    const pieceColor: Color = piece === piece.toUpperCase() ? 'w' : 'b';
    if (!board[toIdx.row]) board[toIdx.row] = Array(8).fill(null);
    board[fromIdx.row][fromIdx.col] = null;
    board[toIdx.row][toIdx.col] = promotion
      ? pieceToChar({type: promotion, color: pieceColor})
      : piece;
    const newPlacement = boardToPlacement(board);
    return [newPlacement, ...rest].slice(0, 6).join(' ');
  },
};

/* ── Evaluation formatting ── */

/**
 * Format an engine evaluation object into a human-readable string.
 * - Mate scores are shown as `"#N"` (e.g. `"#3"` for mate in 3).
 * - Centipawn scores are divided by 100 and shown with a sign and 2 decimal places
 *   (e.g. `"+1.25"`, `"-0.40"`).
 * - Returns `"\u2014"` (em-dash) for missing or unrecognised evaluations.
 *
 * @param evaluation - Object with `type` (`"mate"` | `"cp"`) and a numeric `value`.
 */
export const formatEvaluation = (evaluation: {type: string; value: number | null}) => {
  if (!evaluation) return '—';
  if (evaluation.type === 'mate' && typeof evaluation.value === 'number') return `#${evaluation.value}`;
  if (evaluation.type === 'cp' && typeof evaluation.value === 'number') {
    const score = evaluation.value / 100;
    return `${score >= 0 ? '+' : ''}${score.toFixed(2)}`;
  }
  return '—';
};
