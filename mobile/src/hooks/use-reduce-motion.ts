import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Refleja `reduceMotionEnabled` del sistema (CB-115). Empieza en `false` para
 * no bloquear el primer render mientras se resuelve el valor async.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
