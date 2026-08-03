import type { FollowUpRecord } from './follow-up-store';

const DOT_COLOR = '#213A8E';
const SELECTED_COLOR = '#213A8E';

/** ISO → clave de día local 'YYYY-MM-DD' (la que usa react-native-calendars). */
export function toDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Construye el objeto `markedDates` para el calendario: puntito en días con
 * seguimientos + resaltado del día seleccionado. */
export function buildMarkedDates(
  records: FollowUpRecord[],
  selected: string,
): Record<string, object> {
  const marked: Record<string, { marked?: boolean; dotColor?: string; selected?: boolean; selectedColor?: string }> = {};
  for (const r of records) {
    const key = toDateKey(r.date);
    if (!key) continue;
    marked[key] = { ...marked[key], marked: true, dotColor: DOT_COLOR };
  }
  if (selected) {
    marked[selected] = { ...marked[selected], selected: true, selectedColor: SELECTED_COLOR };
  }
  return marked;
}

/** Seguimientos de un día concreto ('YYYY-MM-DD'), ordenados por hora. */
export function followUpsForDay(records: FollowUpRecord[], dayKey: string): FollowUpRecord[] {
  return records
    .filter((r) => toDateKey(r.date) === dayKey)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
