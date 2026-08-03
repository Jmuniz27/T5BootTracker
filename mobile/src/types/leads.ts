export type LeadStatus =
  | 'NEW'
  | 'QUALIFIED'
  | 'INTERESTED'
  | 'NOT_INTERESTED'
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
  last_outcome: string | null;
  last_interaction_at: string | null;
  days_assigned: number | null;
  owner: string | null;
  owner_name: string | null;
  created_at: string;
}

export interface LeadsResponse {
  my_leads: Lead[];
  available_leads: Lead[];
  converted_leads?: Lead[];
}

export interface Interaction {
  id: string;
  lead: string;
  salesperson: string;
  salesperson_name: string;
  interaction_type: string;
  outcome: string;
  interest_level: number | null;
  notes: string;
  duration_minutes: number | null;
  next_action: string;
  next_action_date: string | null;
  days_as_lead: number | null;
  created_at: string;
}
