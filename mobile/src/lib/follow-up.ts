import { scheduleFollowUpReminder } from './notifications';
import { addFollowUpEvent } from './calendar';

// Presets de seguimiento (evitan un date-picker: UX rápida de un tap).
export const FOLLOW_UP_PRESETS = [
  { key: '1d', label: 'En 1 día', days: 1 },
  { key: '3d', label: 'En 3 días', days: 3 },
  { key: '1w', label: 'En 1 semana', days: 7 },
] as const;

export type FollowUpPresetKey = (typeof FOLLOW_UP_PRESETS)[number]['key'];

/** Convierte un preset (en días) en una fecha a las 9:00 de ese día. */
export function presetToDate(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}

export interface ScheduleFollowUpResult {
  notificationId: string | null;
  eventId: string | null;
}

/**
 * Programa el recordatorio push y, opcionalmente, agrega el evento al
 * calendario del dispositivo. Nunca lanza: cada canal devuelve null si falla.
 */
export async function scheduleFollowUp(opts: {
  leadName: string;
  date: Date;
  addToCalendar: boolean;
  notes?: string;
}): Promise<ScheduleFollowUpResult> {
  const notificationId = await scheduleFollowUpReminder(opts.leadName, opts.date).catch(
    () => null,
  );
  const eventId = opts.addToCalendar
    ? await addFollowUpEvent(opts.leadName, opts.date, opts.notes).catch(() => null)
    : null;
  return { notificationId, eventId };
}
