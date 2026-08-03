import type { Meeting, MeetingInput } from '../api/meetings.api';

export interface MeetingFormValues {
  title: string;
  description: string;
  start: Date;
  end: Date;
  lead: string;
  leadName: string;
  notifyLead: boolean;
}

const HALF_HOUR_MS = 30 * 60 * 1000;

/** Valores por defecto para una reunión nueva (mañana 9:00, 30 min). */
export function emptyMeetingForm(): MeetingFormValues {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  return {
    title: '',
    description: '',
    start,
    end: new Date(start.getTime() + HALF_HOUR_MS),
    lead: '',
    leadName: '',
    notifyLead: true,
  };
}

/** Carga el form desde una reunión existente (para editar). */
export function meetingToForm(m: Meeting, leadName = ''): MeetingFormValues {
  const start = new Date(m.start_time);
  const end = new Date(m.end_time);
  return {
    title: m.title ?? '',
    description: m.description ?? '',
    start,
    end,
    lead: m.lead ?? '',
    leadName,
    notifyLead: false,
  };
}

/** Convierte el form al payload de la API. `null` si falta algo obligatorio. */
export function formToPayload(v: MeetingFormValues): MeetingInput | null {
  if (!v.title.trim() || !v.lead) return null;
  if (v.end.getTime() <= v.start.getTime()) return null;
  return {
    title: v.title.trim(),
    description: v.description.trim() || undefined,
    start_time: v.start.toISOString(),
    end_time: v.end.toISOString(),
    lead: v.lead,
    notify_lead: v.notifyLead,
  };
}
