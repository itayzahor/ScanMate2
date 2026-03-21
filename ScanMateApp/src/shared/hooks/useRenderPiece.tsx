import React, {useCallback} from 'react';
import {Image} from 'react-native';
import type {PieceSymbol} from 'chess.js';
import {PIECE_ASSETS} from '../constants/pieces';

export function useRenderPiece(boardSize: number, isFlipped: boolean) {
  return useCallback(
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
}
