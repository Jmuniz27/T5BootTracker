import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import { openDialer } from '../lib/phone';
import type { Lead } from '../types/leads';

/**
 * Quick Call (HST-030): abre el marcador con el teléfono del lead y, al volver
 * a la app tras la llamada, ofrece registrar la interacción.
 *
 * El prompt aparece únicamente cuando la app regresa a primer plano después de
 * una llamada que iniciamos nosotros — no en cualquier cambio de estado.
 */
export function useQuickCall() {
  const router = useRouter();
  const pendingLead = useRef<Lead | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;

      const returnedToForeground = prev !== 'active' && next === 'active';

      if (returnedToForeground && pendingLead.current) {
        const lead = pendingLead.current;
        pendingLead.current = null;
        Alert.alert(
          'Registrar llamada',
          `¿Quieres registrar la interacción con ${lead.name}?`,
          [
            { text: 'Ahora no', style: 'cancel' },
            {
              text: 'Registrar',
              onPress: () =>
                router.push({
                  pathname: '/(app)/leads/[id]/log-interaction',
                  params: { id: lead.id },
                }),
            },
          ],
        );
      }
    });

    return () => subscription.remove();
  }, [router]);

  const startCall = useCallback(async (lead: Lead) => {
    const launched = await openDialer(lead.phone);
    if (launched) {
      // Se recuerda el lead para ofrecer el registro al volver a la app.
      pendingLead.current = lead;
    } else {
      Alert.alert(
        'No se pudo llamar',
        'Este dispositivo no puede realizar llamadas o el número no es válido.',
      );
    }
  }, []);

  return { startCall };
}
