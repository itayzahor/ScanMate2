import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme';

type GameNavRowProps = {
  canGoBack: boolean;
  canGoForward: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
};

export const GameNavRow: React.FC<GameNavRowProps> = ({
  canGoBack, canGoForward, onFirst, onPrev, onNext, onLast,
}) => (
  <View style={navStyles.row}>
    <TouchableOpacity
      style={[navStyles.button, !canGoBack && navStyles.disabled]}
      disabled={!canGoBack}
      onPress={onFirst}
    >
      <Text style={navStyles.text}>{'|◁'}</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[navStyles.button, !canGoBack && navStyles.disabled]}
      disabled={!canGoBack}
      onPress={onPrev}
    >
      <Text style={navStyles.text}>{'◁'}</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[navStyles.button, !canGoForward && navStyles.disabled]}
      disabled={!canGoForward}
      onPress={onNext}
    >
      <Text style={navStyles.text}>{'▷'}</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[navStyles.button, !canGoForward && navStyles.disabled]}
      disabled={!canGoForward}
      onPress={onLast}
    >
      <Text style={navStyles.text}>{'▷|'}</Text>
    </TouchableOpacity>
  </View>
);

const navStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  button: {
    width: 48,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#1f1f1f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.3,
  },
  text: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '700',
  },
});
