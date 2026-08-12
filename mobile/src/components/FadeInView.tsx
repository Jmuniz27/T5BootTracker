import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '../hooks/use-reduce-motion';

/**
 * Fade-in al montar una pantalla (CB-115). Usa la `Animated` API nativa con
 * `useNativeDriver: true` para no bloquear el JS thread, igual que el resto
 * de animaciones ya existentes en la app (useQuickCall, etc).
 */
export function FadeInView({
  children,
  style,
  duration = 180,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
}) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, duration, opacity]);

  return <Animated.View style={[{ flex: 1, opacity }, style]}>{children}</Animated.View>;
}
