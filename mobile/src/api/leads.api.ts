import { api } from '../lib/api';
import type { LeadsResponse, Interaction, LeadStatus } from '../types/leads';

interface LeadFilters {
  search?: string;
  status?: string;
  source?: string;
}

export async function fetchLeads(filters?: LeadFilters): Promise<LeadsResponse> {
  const { data } = await api.get<LeadsResponse>('/leads/', { params: filters });
  return data;
}

export async function assignLead(leadId: string) {
  const { data } = await api.patch(`/leads/${leadId}/assign/`);
  return data;
}

export async function releaseLead(leadId: string) {
  const { data } = await api.patch(`/leads/${leadId}/release/`);
  return data;
}

export async function updateLeadStatus(leadId: string, payload: { status: LeadStatus }) {
  const { data } = await api.patch(`/leads/${leadId}/`, payload);
  return data;
}

export interface InteractionPayload {
  interaction_type: string;
  outcome: string;
  interest_level?: number | null;
  notes?: string;
  duration_minutes?: number | null;
}

export async function logInteraction(leadId: string, payload: InteractionPayload) {
  const { data } = await api.post(`/leads/${leadId}/interactions/`, payload);
  return data;
}

export async function fetchInteractions(leadId: string): Promise<Interaction[]> {
  const { data } = await api.get<Interaction[]>(`/leads/${leadId}/interactions/`);
  return data;
}

export async function updateInteraction(
  leadId: string,
  interactionId: string,
  payload: Partial<InteractionPayload>,
): Promise<Interaction> {
  const { data } = await api.patch<Interaction>(
    `/leads/${leadId}/interactions/${interactionId}/`,
    payload,
  );
  return data;
}

// ─── Crear / convertir lead ───────────────────────────────────────────────────

export interface LeadInput {
  name: string;
  phone: string;
  email?: string;
  program_interest?: string;
  source: string; // INSTAGRAM | WHATSAPP | LANDING_PAGE | MANUAL
  is_company?: boolean;
  status?: string;
  confirm_duplicate?: boolean;
}

// Devuelve el lead creado, o { duplicate: {...} } si hay un posible duplicado
// (reenviar con confirm_duplicate: true para forzar la creación).
export async function createLead(payload: LeadInput) {
  const { data } = await api.post('/leads/', payload);
  return data;
}

export interface Program {
  id: string;
  name: string;
}

export async function getPrograms(): Promise<Program[]> {
  const { data } = await api.get('/programs/');
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export interface ConvertPayload {
  cedula: string;
  program_id: string;
  email?: string;
  phone?: string;
}

export async function convertLead(leadId: string, payload: ConvertPayload) {
  const { data } = await api.post(`/leads/${leadId}/convert/`, payload);
  return data;
}
