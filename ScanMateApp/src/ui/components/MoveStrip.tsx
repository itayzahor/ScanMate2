import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type VariationChip = { san: string; childIndex: number };

type MoveStripProps = {
  prevLabel: string | null;
  currLabel: string | null;
  nextLabel: string | null;
  currentDepth: number;
  lineLength: number;
  onPrev: () => void;
  onNext: () => void;
  /** Variation chips at the *next* move point (children of current node). */
  variations?: VariationChip[];
  /** Which child index is currently selected (for highlighting the active chip). */
  activeChildIndex?: number;
  onSelectVariation?: (childIndex: number) => void;
};

export const MoveStrip: React.FC<MoveStripProps> = ({
  prevLabel, currLabel, nextLabel, currentDepth, lineLength,
  onPrev, onNext, variations, activeChildIndex, onSelectVariation,
}) => (
  <View>
    {/* Variation chips row */}
    {variations && variations.length > 1 && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={stripStyles.chipsRow}>
        {variations.map((v, i) => {
          const isActive = v.childIndex === activeChildIndex;
          return (
            <TouchableOpacity
              key={v.childIndex}
              style={[stripStyles.chip, isActive && stripStyles.chipActive]}
              onPress={() => onSelectVariation?.(v.childIndex)}
              activeOpacity={0.7}
            >
              <Text style={[stripStyles.chipText, isActive && stripStyles.chipTextActive]}>
                {i === 0 ? v.san : `↳ ${v.san}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    )}

    {/* Main strip */}
    <View style={stripStyles.container}>
      <TouchableOpacity
        style={stripStyles.side}
        disabled={currentDepth < 2}
        onPress={onPrev}
        activeOpacity={0.6}
      >
        {prevLabel ? (
          <>
            <Text style={stripStyles.sideText}>{prevLabel}</Text>
            <Text style={stripStyles.arrow}>◁</Text>
          </>
        ) : <View />}
      </TouchableOpacity>

      <View style={stripStyles.center}>
        <Text style={stripStyles.current}>{currLabel ?? 'Start'}</Text>
        <Text style={stripStyles.counter}>
          {currentDepth === 0 ? 'Start' : `${currentDepth} / ${lineLength}`}
        </Text>
      </View>

      <TouchableOpacity
        style={stripStyles.side}
        disabled={!nextLabel}
        onPress={onNext}
        activeOpacity={0.6}
      >
        {nextLabel ? (
          <>
            <Text style={stripStyles.sideText}>{nextLabel}</Text>
            <Text style={stripStyles.arrow}>▷</Text>
          </>
        ) : <View />}
      </TouchableOpacity>
    </View>
  </View>
);

const stripStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  side: {
    flex: 1,
    alignItems: 'center',
    opacity: 0.7,
  },
  sideText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '400',
  },
  arrow: {
    color: '#666',
    fontSize: 16,
    marginTop: 2,
  },
  center: {
    flex: 1.4,
    alignItems: 'center',
  },
  current: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  counter: {
    color: '#999',
    fontSize: 11,
    marginTop: 2,
  },
  /* Variation chips */
  chipsRow: {
    flexDirection: 'row',
    marginBottom: 6,
    maxHeight: 36,
  },
  chip: {
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: '#3a5a8a',
  },
  chipText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
