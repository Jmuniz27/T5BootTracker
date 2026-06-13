export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'SPEAK_COORDINATOR'
  | 'CONVERTED';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  status: LeadStatus;
  is_company: boolean;
  program_interest: string;
  interaction_count: number;
  days_assigned: number | null;
  owner: string | null;
  owner_name: string | null;
  created_at: string;
}

export interface LeadsResponse {
  my_leads: Lead[];
  available_leads: Lead[];
}
