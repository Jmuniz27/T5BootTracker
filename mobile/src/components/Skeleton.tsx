import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '../hooks/use-reduce-motion';

/**
 * Placeholder animado para estados de carga (CB-115). Pulso de opacidad con
 * `useNativeDriver: true` — más barato que un shimmer con gradiente y
 * suficiente para comunicar "cargando" en listas de leads/pagos.
 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, opacity]);

  return <Animated.View style={[styles.base, { opacity }, style]} />;
}

export function LeadCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton style={styles.avatar} />
      <View style={styles.lines}>
        <Skeleton style={styles.lineWide} />
        <Skeleton style={styles.lineNarrow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  lines: {
    flex: 1,
    gap: 8,
  },
  lineWide: {
    height: 14,
    width: '70%',
  },
  lineNarrow: {
    height: 12,
    width: '40%',
  },
});
