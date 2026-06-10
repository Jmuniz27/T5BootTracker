import { api } from '../lib/api';
import type { LeadsResponse } from '../types/leads';

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
