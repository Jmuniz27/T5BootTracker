import { describe, it, expect } from 'vitest'
import { normalizeMeetings, toCalendarEvents, flattenLeads, toDatetimeLocal } from '../meetings'

describe('normalizeMeetings', () => {
  it('acepta un array plano', () => {
    expect(normalizeMeetings([{ id: '1' }])).toHaveLength(1)
  })
  it('acepta respuesta paginada {results}', () => {
    expect(normalizeMeetings({ results: [{ id: '1' }, { id: '2' }] })).toHaveLength(2)
  })
  it('devuelve [] ante nulo/indefinido', () => {
    expect(normalizeMeetings(undefined)).toEqual([])
    expect(normalizeMeetings(null)).toEqual([])
  })
})

describe('toCalendarEvents', () => {
  const meetings = [
    { id: 'm1', title: 'Reunión Ana', start_time: '2026-08-05T14:00:00Z', end_time: '2026-08-05T14:30:00Z', lead: 'lead-1' },
    { id: 'm2', title: '', start_time: '2026-08-06T10:00:00Z', end_time: '2026-08-06T10:30:00Z', lead: 'lead-2' },
  ]

  it('mapea a eventos con Date en start/end', () => {
    const events = toCalendarEvents(meetings)
    expect(events[0]).toMatchObject({ id: 'm1', title: 'Reunión Ana' })
    expect(events[0].start).toBeInstanceOf(Date)
    expect(events[0].resource).toBe(meetings[0])
  })

  it('usa el nombre del lead como título si no hay título', () => {
    const events = toCalendarEvents(meetings, { 'lead-2': 'Luis Pérez' })
    expect(events[1].title).toBe('Luis Pérez')
  })

  it('con showOwner agrega el responsable al título (agenda global admin)', () => {
    const conDueno = [{ ...meetings[0], assigned_to_name: 'Zahid Díaz' }]
    const events = toCalendarEvents(conDueno, {}, { showOwner: true })
    expect(events[0].title).toBe('Reunión Ana · Zahid Díaz')
  })

  it('sin showOwner no agrega el responsable', () => {
    const conDueno = [{ ...meetings[0], assigned_to_name: 'Zahid Díaz' }]
    const events = toCalendarEvents(conDueno)
    expect(events[0].title).toBe('Reunión Ana')
  })
})

describe('flattenLeads', () => {
  it('combina my_leads y available_leads', () => {
    const data = {
      my_leads: [{ id: 'a', name: 'Ana' }],
      available_leads: [{ id: 'b', name: 'Beto' }],
    }
    expect(flattenLeads(data)).toEqual([
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Beto' },
    ])
  })
  it('acepta un array plano', () => {
    expect(flattenLeads([{ id: 'a', name: 'Ana' }])).toEqual([{ id: 'a', name: 'Ana' }])
  })

  it('combina las claves del admin y deduplica por id', () => {
    const data = {
      all_leads: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }],
      assigned_leads: [{ id: 'a', name: 'Ana' }],
      unassigned_leads: [{ id: 'c', name: 'Caro' }],
    }
    expect(flattenLeads(data)).toEqual([
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Beto' },
      { id: 'c', name: 'Caro' },
    ])
  })
})

describe('toDatetimeLocal', () => {
  it('formatea a YYYY-MM-DDTHH:mm', () => {
    expect(toDatetimeLocal(new Date(2026, 7, 5, 9, 5))).toBe('2026-08-05T09:05')
  })
  it('devuelve "" ante fecha inválida', () => {
    expect(toDatetimeLocal('nope')).toBe('')
  })
})
