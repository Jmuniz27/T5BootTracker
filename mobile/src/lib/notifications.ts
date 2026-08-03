import * as Notifications from 'expo-notifications';

// Muestra las notificaciones aunque la app esté en primer plano.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Pide permiso de notificaciones (idempotente). Devuelve si quedó concedido. */
export async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Programa un recordatorio local de seguimiento para `date`. Devuelve el id de
 * la notificación, o `null` si la fecha es pasada o no hay permiso.
 */
export async function scheduleFollowUpReminder(
  leadName: string,
  date: Date,
): Promise<string | null> {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (date.getTime() <= Date.now()) return null;

  const granted = await ensureNotificationPermissions();
  if (!granted) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Seguimiento pendiente',
      body: `Es hora de dar seguimiento a ${leadName}.`,
      data: { kind: 'lead-follow-up' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}
