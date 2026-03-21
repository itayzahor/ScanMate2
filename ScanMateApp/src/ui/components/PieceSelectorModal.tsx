import React from 'react';
import {View, Text, TouchableOpacity, Modal, Image} from 'react-native';
import type {PieceSymbol, Color} from 'chess.js';
import {styles} from '../styles/Analysis.styles';
import {PIECE_OPTIONS} from '../../shared/constants/board';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (piece: {type: PieceSymbol; color: Color} | null) => void;
};

export const PieceSelectorModal: React.FC<Props> = ({visible, onClose, onSelect}) => (
  <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Edit Square</Text>
        <View style={styles.gridContainer}>
          {PIECE_OPTIONS.map(p => (
            <TouchableOpacity
              key={`${p.color}-${p.type}`}
              style={styles.gridItem}
              onPress={() => onSelect({type: p.type, color: p.color})}>
              <Image source={p.asset} style={styles.pieceImage} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.gridItem, styles.trashOption]}
            onPress={() => onSelect(null)}>
            <Text style={styles.trashLabel}>🗑️ Empty</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  </Modal>
);
