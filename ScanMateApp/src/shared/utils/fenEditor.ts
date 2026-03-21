import {Chess, Square, PieceSymbol, Color} from 'chess.js';
import {normalizeFen} from './fen';
import {squareToIndices, indicesToSquare, reverseSquare} from './board';

/* ── Board ↔ placement helpers ── */

export const emptyBoard = () =>
  Array.from({length: 8}, () => Array(8).fill(null) as Array<string | null>);

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

export const charToPiece = (char: string): {type: PieceSymbol; color: Color} => ({
  type: char.toLowerCase() as PieceSymbol,
  color: char === char.toUpperCase() ? 'w' : 'b',
});

export const pieceToChar = (piece: {type: PieceSymbol; color: Color}) =>
  piece.color === 'w' ? piece.type.toUpperCase() : piece.type;

export const loadChess = (fen: string): Chess | null => {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
};

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

type LogicMove = {from: Square; to: Square; promotion?: PieceSymbol; isFree?: boolean};

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

export const FenUtils = {
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

  toggleTurn: (fen: string): string => {
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    return parts.join(' ');
  },

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

  getPieceAt: (currentFen: string, square: Square) => {
    const normalized = normalizeFen(currentFen);
    const [placement] = normalized.split(' ');
    const board = placementToBoard(placement);
    const {row, col} = squareToIndices(square);
    const cell = board[row]?.[col] ?? null;
    if (!cell) return null;
    return charToPiece(cell);
  },

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

export const formatEvaluation = (evaluation: {type: string; value: number | null}) => {
  if (!evaluation) return '—';
  if (evaluation.type === 'mate' && typeof evaluation.value === 'number') return `#${evaluation.value}`;
  if (evaluation.type === 'cp' && typeof evaluation.value === 'number') {
    const score = evaluation.value / 100;
    return `${score >= 0 ? '+' : ''}${score.toFixed(2)}`;
  }
  return '—';
};
