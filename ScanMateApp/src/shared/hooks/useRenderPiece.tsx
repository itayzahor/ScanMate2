import React, {useCallback} from 'react';
import {Image} from 'react-native';
import type {PieceSymbol} from 'chess.js';
import {PIECE_ASSETS} from '../constants/pieces';

/**
 * `useRenderPiece` returns a memoized render function used by the chessboard
 * to draw individual chess pieces as React Native `Image` elements.
 *
 * The returned function is stable across re-renders as long as `boardSize` and
 * `isFlipped` remain the same, making it safe to pass directly to board
 * components that accept a `renderPiece` prop.
 *
 * @param boardSize - The pixel size of the full board. Each piece is rendered at
 *                    `boardSize / 8` × `boardSize / 8` to fill one square.
 * @param isFlipped - When true the piece image is rotated 180° so that it reads
 *                    correctly on a flipped (black-side) board.
 * @returns A callback `(piece) => JSX.Element` that renders the image for the
 *          given piece code (e.g. `"wP"`, `"bK"`).
 */
export function useRenderPiece(boardSize: number, isFlipped: boolean) {
  return useCallback(
    /**
     * Renders a single chess piece image.
     *
     * @param piece - A chess.js piece string in the form `"<color><symbol>"`
     *                (e.g. `"wP"` for white pawn, `"bK"` for black king).
     *                Falls back to the white pawn asset if the key is unrecognised.
     */
    (piece: `${string}${PieceSymbol}`) => {
      // Look up the static image asset for this piece; default to white pawn on unknown keys.
      const assetKey = (piece as keyof typeof PIECE_ASSETS) ?? 'wp';
      const source = PIECE_ASSETS[assetKey] ?? PIECE_ASSETS.wp;

      return (
        <Image
          source={source}
          style={{
            // Each square is exactly 1/8th of the total board size.
            width: boardSize / 8,
            height: boardSize / 8,
            // Rotate the piece 180° when the board is rendered from black's perspective.
            transform: [{rotate: isFlipped ? '180deg' : '0deg'}],
          }}
          resizeMode="contain"
        />
      );
    },
    // Re-create the callback only when the board dimensions or orientation change.
    [boardSize, isFlipped],
  );
}
