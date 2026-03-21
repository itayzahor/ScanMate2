import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  isBlackTurn: boolean;
  onChange: (isBlack: boolean) => void;
};

export const SideToMoveToggle: React.FC<Props> = ({ isBlackTurn, onChange }) => (
  <View style={s.container}>
    <TouchableOpacity
      style={[s.half, !isBlackTurn && s.active]}
      onPress={() => onChange(false)}
      activeOpacity={0.7}
    >
      <Text style={[s.text, !isBlackTurn && s.textActive]}>White</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[s.half, isBlackTurn && s.active]}
      onPress={() => onChange(true)}
      activeOpacity={0.7}
    >
      <Text style={[s.text, isBlackTurn && s.textActive]}>Black</Text>
    </TouchableOpacity>
  </View>
);

const s = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#1f1f1f',
    borderRadius: 8,
    overflow: 'hidden',
  },
  half: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  active: {
    backgroundColor: '#333',
    borderRadius: 8,
  },
  text: {
    color: '#777',
    fontWeight: '600',
    fontSize: 13,
  },
  textActive: {
    color: '#fff',
  },
});
