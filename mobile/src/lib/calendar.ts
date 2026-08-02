import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

const FOLLOW_UP_DURATION_MS = 30 * 60 * 1000; // 30 min

/** Pide permiso de calendario (idempotente). Devuelve si quedó concedido. */
export async function ensureCalendarPermissions(): Promise<boolean> {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted) return true;
  const requested = await Calendar.requestCalendarPermissionsAsync();
  return requested.granted;
}

/** Resuelve un calendario modificable donde crear el evento. */
async function resolveDefaultCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const cal = await Calendar.getDefaultCalendarAsync();
    return cal?.id ?? null;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((c) => c.allowsModifications) ?? calendars[0];
  return writable?.id ?? null;
}

/**
 * Crea un evento de seguimiento en el calendario del dispositivo. Devuelve el
 * id del evento, o `null` si no hay permiso o calendario disponible.
 */
export async function addFollowUpEvent(
  leadName: string,
  date: Date,
  notes?: string,
): Promise<string | null> {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  const granted = await ensureCalendarPermissions();
  if (!granted) return null;

  const calendarId = await resolveDefaultCalendarId();
  if (!calendarId) return null;

  return Calendar.createEventAsync(calendarId, {
    title: `Seguimiento: ${leadName}`,
    startDate: date,
    endDate: new Date(date.getTime() + FOLLOW_UP_DURATION_MS),
    notes,
    alarms: [{ relativeOffset: -30 }],
  });
}
