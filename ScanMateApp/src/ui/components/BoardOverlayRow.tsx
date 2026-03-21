import React from 'react';
import {View, Pressable} from 'react-native';
import type {Square} from 'chess.js';
import {styles} from '../styles/Analysis.styles';

type Props = {
  squares: Square[];
  onSquarePress: (square: Square) => void;
  onSquareLongPress: (square: Square) => void;
};

const OverlayRowComponent: React.FC<Props> = ({squares, onSquarePress, onSquareLongPress}) => (
  <View style={styles.overlayRow}>
    {squares.map(square => (
      <Pressable
        key={square}
        style={styles.overlaySquare}
        android_ripple={{color: 'transparent'}}
        delayLongPress={250}
        onPress={() => onSquarePress(square)}
        onLongPress={() => onSquareLongPress(square)}
      />
    ))}
  </View>
);

export const OverlayRow = React.memo(OverlayRowComponent);
OverlayRow.displayName = 'OverlayRow';
