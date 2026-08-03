import { api } from '../lib/api';

// Reunión del servidor (meetings API — sync a Google Calendar + invitación al lead).
export interface Meeting {
  id: string;
  title: string;
  description: string;
  start_time: string; // ISO
  end_time: string; // ISO
  lead: string; // id del lead
  assigned_to: string | null;
  google_event_id: string | null;
  created_at: string;
}

export interface MeetingInput {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  lead: string;
  notify_lead?: boolean; // ignorado por el backend hasta que exista el flag
}

interface Paginated<T> {
  results?: T[];
}

function unwrap(data: Meeting[] | Paginated<Meeting>): Meeting[] {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export async function getMeetings(params?: Record<string, string>): Promise<Meeting[]> {
  const { data } = await api.get('/meetings/events/', { params });
  return unwrap(data);
}

export async function createMeeting(input: MeetingInput): Promise<Meeting> {
  const { data } = await api.post('/meetings/events/', input);
  return data;
}

export async function updateMeeting(id: string, input: Partial<MeetingInput>): Promise<Meeting> {
  const { data } = await api.patch(`/meetings/events/${id}/`, input);
  return data;
}

export async function deleteMeeting(id: string): Promise<void> {
  await api.delete(`/meetings/events/${id}/`);
}
