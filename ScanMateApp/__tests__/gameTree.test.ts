import { Chess } from 'chess.js';

import {
  STARTING_FEN,
} from '../src/shared/utils/fen';
import {
  addMove,
  buildFromMoves,
  findMatchingSanForPlacement,
  truncateAfter,
} from '../src/shared/utils/gameTree';

describe('gameTree shared move resolution', () => {
  it('resolves castling SAN from placement-only target', () => {
    const fromFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const chess = new Chess(fromFen);
    chess.move('O-O');
    const targetPlacement = chess.fen().split(' ')[0];

    expect(findMatchingSanForPlacement(fromFen, targetPlacement)).toBe('O-O');
  });

  it('resolves en passant SAN from placement-only target', () => {
    const fromFen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
    const chess = new Chess(fromFen);
    chess.move('exd6');
    const targetPlacement = chess.fen().split(' ')[0];

    expect(findMatchingSanForPlacement(fromFen, targetPlacement)).toBe('exd6');
  });

  it('returns null when placement is not reachable by one legal move', () => {
    const impossiblePlacement = '8/8/8/8/8/8/8/8';
    expect(findMatchingSanForPlacement(STARTING_FEN, impossiblePlacement)).toBeNull();
  });
});

describe('gameTree immutable mutations', () => {
  it('adds a variation without mutating original tree', () => {
    const original = buildFromMoves(STARTING_FEN, ['e4', 'e5', 'Nf3']);
    const result = addMove(original, [0], 'Nc6');

    expect(result.tree).not.toBe(original);
    expect(original.root[0].children).toHaveLength(1);
    expect(result.tree.root[0].children).toHaveLength(2);
    expect(result.path).toEqual([0, 1]);
  });

  it('truncates descendants without mutating original tree', () => {
    const original = buildFromMoves(STARTING_FEN, ['e4', 'e5', 'Nf3']);
    const truncated = truncateAfter(original, [0, 0]);

    expect(truncated).not.toBe(original);
    expect(original.root[0].children[0].children).toHaveLength(1);
    expect(truncated.root[0].children[0].children).toHaveLength(0);
  });
});
