import { api } from '../lib/api';
import type { LeadsResponse, Interaction } from '../types/leads';

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

export interface InteractionPayload {
  interaction_type: string;
  outcome: string;
  interest_level?: number | null;
  notes?: string;
  duration_minutes?: number | null;
  next_action?: string;
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
