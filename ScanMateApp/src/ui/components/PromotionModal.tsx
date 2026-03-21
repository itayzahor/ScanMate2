import React from 'react';
import {View, Text, TouchableOpacity, Modal, Image} from 'react-native';
import type {PieceSymbol, Color} from 'chess.js';
import {styles} from '../styles/Analysis.styles';
import {PIECE_ASSETS} from '../../shared/constants/pieces';
import {PROMOTION_CHOICES} from '../../shared/constants/board';

type Props = {
  visible: boolean;
  color: Color;
  onSelect: (piece: PieceSymbol) => void;
  onCancel: () => void;
};

export const PromotionModal: React.FC<Props> = ({visible, color, onSelect, onCancel}) => (
  <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onCancel}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Promote Pawn</Text>
        <View style={styles.gridContainer}>
          {PROMOTION_CHOICES.map(type => (
            <TouchableOpacity
              key={`${color}-${type}`}
              style={styles.gridItem}
              onPress={() => onSelect(type)}>
              <Image
                source={PIECE_ASSETS[`${color}${type}` as `${Color}${PieceSymbol}`]}
                style={styles.pieceImage}
              />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[styles.gridItem, styles.trashOption]} onPress={onCancel}>
          <Text style={styles.trashLabel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);
