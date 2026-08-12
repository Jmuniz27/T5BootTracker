import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from '../src/context/AuthContext';
import { useReduceMotion } from '../src/hooks/use-reduce-motion';
import '../src/i18n';

export default function RootLayout() {
  const reduceMotion = useReduceMotion();

  return (
    <AuthProvider>
      <PaperProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: reduceMotion ? 'none' : 'slide_from_right',
          }}
        />
      </PaperProvider>
    </AuthProvider>
  );
}
