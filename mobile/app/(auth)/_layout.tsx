import { Stack } from 'expo-router';
import { useReduceMotion } from '../../src/hooks/use-reduce-motion';

export default function AuthLayout() {
  const reduceMotion = useReduceMotion();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? 'none' : 'slide_from_right',
      }}
    />
  );
}
