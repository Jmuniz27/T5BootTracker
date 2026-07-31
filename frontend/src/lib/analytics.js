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

// ─── Selectores para las KPI cards (CB-57 / S4-4a) ───────────────────────────
//
// Devuelven `value: null` cuando el backend no tiene dato suficiente (por
// ejemplo, tiempo de respuesta sin ninguna interacción registrada). Eso es
// distinto de cero y la tarjeta lo pinta como "—", no como "0".

const pct = (v) => (v === null || v === undefined ? null : num(v))

export function toConversionCard(kpis) {
  const block = kpis?.conversion_rate
  return {
    value: pct(block?.rate_percentage),
    converted: num(block?.converted_leads),
    total: num(block?.total_leads),
  }
}

export function toResponseTimeCard(kpis) {
  const block = kpis?.response_time
  return {
    value: block?.avg_hours ?? null,
    median: block?.median_hours ?? null,
    withoutResponse: num(block?.leads_without_response),
  }
}

export function toVelocityCard(kpis) {
  const block = kpis?.lead_velocity
  return {
    value: num(block?.current_period?.count),
    previous: num(block?.previous_period?.count),
    growth: block?.growth_rate_percentage ?? null,
  }
}

export function toPaymentCard(kpis) {
  const block = kpis?.payment_collection?.overall
  return {
    value: pct(block?.collection_rate_percentage),
    collected: num(block?.collected_amount),
    expected: num(block?.expected_amount),
  }
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
