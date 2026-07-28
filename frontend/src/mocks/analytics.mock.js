/**
 * Mock payload for the Analytics dashboard (CB-57).
 *
 * Mirrors the contract expected from the CB-55 Analytics API:
 *   GET /api/analytics/dashboard/?date_from&date_to&segment&program_id
 *
 * When CB-55 lands, this file is only used as a fallback / test fixture.
 * The real endpoint must return this exact shape.
 */

function daySeries(days, base, spread) {
  const out = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const newLeads = Math.max(0, Math.round(base + Math.sin(i / 3) * spread + (i % 4)))
    const converted = Math.max(0, Math.round(newLeads * 0.28))
    const collected = Math.round((newLeads * 90 + (i % 5) * 40) * 100) / 100
    const expected = Math.round(collected * 1.35 * 100) / 100
    out.push({ date, new_leads: newLeads, converted, collected, expected })
  }
  return out
}

const series = daySeries(30, 12, 6)

export const analyticsDashboardMock = {
  kpis: {
    total_leads: series.reduce((a, d) => a + d.new_leads, 0),
    leads_delta_pct: 12.4,
    conversion_rate: 0.31,
    conversion_delta_pct: -2.1,
    revenue_collected: series.reduce((a, d) => a + d.collected, 0),
    revenue_delta_pct: 8.7,
    pending_payments: 17,
  },
  leads_over_time: series.map(({ date, new_leads, converted }) => ({ date, new_leads, converted })),
  revenue_over_time: series.map(({ date, collected, expected }) => ({ date, collected, expected })),
  leads_by_status: [
    { status: 'NEW', count: 120 },
    { status: 'CONTACTED', count: 90 },
    { status: 'INTERESTED', count: 64 },
    { status: 'NOT_INTERESTED', count: 22 },
    { status: 'CONVERTED', count: 132 },
  ],
  conversion_funnel: [
    { stage: 'Lead', count: 428 },
    { stage: 'Contacted', count: 310 },
    { stage: 'Interested', count: 190 },
    { stage: 'Converted', count: 132 },
  ],
  // Lead management temporal metrics (CB-122 · CR-006 · HST-024).
  // Derived from the assignment lifecycle: retention = assigned_at → released_at/now;
  // time to first contact = assigned_at → first interaction.
  lead_management: {
    avg_retention_hours: 42.6,
    avg_time_to_first_contact_hours: 5.3,
    by_salesperson: [
      { salesperson: 'María Cedeño', active_leads: 8, avg_retention_hours: 38.2, avg_time_to_first_contact_hours: 3.1 },
      { salesperson: 'Jorge Rivas', active_leads: 11, avg_retention_hours: 51.7, avg_time_to_first_contact_hours: 7.8 },
      { salesperson: 'Lucía Paz', active_leads: 6, avg_retention_hours: 29.4, avg_time_to_first_contact_hours: 4.6 },
    ],
  },
}

export default analyticsDashboardMock
