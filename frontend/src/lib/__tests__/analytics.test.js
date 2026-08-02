import { describe, it, expect } from 'vitest'
import {
  toConversionBySegment,
  toResponseTimeSeries,
  toVelocitySeries,
  toPaymentByProgram,
} from '../analytics'

const kpis = {
  conversion_rate: {
    by_segment: [
      { segment: 'INSTAGRAM', total_leads: 10, converted_leads: 3, rate_percentage: 30 },
      { segment: 'WHATSAPP', total_leads: 4, converted_leads: 1, rate_percentage: 25 },
    ],
  },
  response_time: {
    series: [{ period_start: '2026-07-01', avg_hours: 4.5, count: 5 }],
  },
  lead_velocity: {
    series: [
      { period_start: '2026-07-01', count: 7 },
      { period_start: '2026-07-02', count: 0 },
    ],
  },
  payment_collection: {
    by_program: [
      { program_name: 'Full Stack', expected_amount: '1000.00', collected_amount: '750.00', is_critical: true },
    ],
  },
}

describe('toConversionBySegment', () => {
  it('mapea cada segmento con su tasa', () => {
    const out = toConversionBySegment(kpis)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ segment: 'INSTAGRAM', rate: 30, total: 10, converted: 3 })
  })

  it('devuelve [] si no hay datos', () => {
    expect(toConversionBySegment(undefined)).toEqual([])
    expect(toConversionBySegment({})).toEqual([])
  })
})

describe('toResponseTimeSeries', () => {
  it('mapea la serie semanal', () => {
    const out = toResponseTimeSeries(kpis)
    expect(out).toEqual([{ period: '2026-07-01', avgHours: 4.5, count: 5 }])
  })
})

describe('toVelocitySeries', () => {
  it('conserva los buckets con zero-fill', () => {
    const out = toVelocitySeries(kpis)
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual({ period: '2026-07-02', count: 0 })
  })
})

describe('toPaymentByProgram', () => {
  it('convierte montos string a número', () => {
    const out = toPaymentByProgram(kpis)
    expect(out[0]).toEqual({
      program: 'Full Stack',
      expected: 1000,
      collected: 750,
      isCritical: true,
    })
  })

  it('trata montos inválidos como 0', () => {
    const out = toPaymentByProgram({
      payment_collection: { by_program: [{ program_name: 'X', expected_amount: null, collected_amount: 'abc' }] },
    })
    expect(out[0].expected).toBe(0)
    expect(out[0].collected).toBe(0)
  })
})
