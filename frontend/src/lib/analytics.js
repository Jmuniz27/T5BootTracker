// Transforma la respuesta de GET /api/analytics/kpis/ en arrays listos para
// Recharts. Funciones puras y tolerantes a datos ausentes (devuelven []).

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Tasa de conversión por segmento (source del lead).
export function toConversionBySegment(kpis) {
  const rows = kpis?.conversion_rate?.by_segment ?? []
  return rows.map((r) => ({
    segment: r.segment ?? '—',
    rate: num(r.rate_percentage),
    total: num(r.total_leads),
    converted: num(r.converted_leads),
  }))
}

// Serie semanal de tiempo de respuesta promedio (horas).
export function toResponseTimeSeries(kpis) {
  const rows = kpis?.response_time?.series ?? []
  return rows.map((r) => ({
    period: r.period_start,
    avgHours: num(r.avg_hours),
    count: num(r.count),
  }))
}

// Serie de velocidad de leads (conteo por período, con zero-fill del backend).
export function toVelocitySeries(kpis) {
  const rows = kpis?.lead_velocity?.series ?? []
  return rows.map((r) => ({
    period: r.period_start,
    count: num(r.count),
  }))
}

// Cobro esperado vs cobrado por programa.
export function toPaymentByProgram(kpis) {
  const rows = kpis?.payment_collection?.by_program ?? []
  return rows.map((r) => ({
    program: r.program_name ?? '—',
    expected: num(r.expected_amount),
    collected: num(r.collected_amount),
    isCritical: Boolean(r.is_critical),
  }))
}
