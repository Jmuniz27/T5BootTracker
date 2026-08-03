import { toDateKey, buildMarkedDates, followUpsForDay } from '../agenda-helpers';
import type { FollowUpRecord } from '../follow-up-store';

const rec = (id: string, date: string): FollowUpRecord => ({
  id,
  leadId: `lead-${id}`,
  leadName: `Lead ${id}`,
  date,
  notificationId: null,
  eventId: null,
});

describe('toDateKey', () => {
  it('convierte ISO a YYYY-MM-DD local', () => {
    expect(toDateKey('2026-07-30T14:05:00')).toBe('2026-07-30');
  });
  it('devuelve "" ante fecha inválida', () => {
    expect(toDateKey('nope')).toBe('');
  });
});

describe('buildMarkedDates', () => {
  it('marca los días con seguimientos y resalta el seleccionado', () => {
    const records = [rec('a', '2026-07-30T09:00:00'), rec('b', '2026-08-01T10:00:00')];
    const marked = buildMarkedDates(records, '2026-07-30');
    expect(marked['2026-07-30']).toMatchObject({ marked: true, selected: true });
    expect(marked['2026-08-01']).toMatchObject({ marked: true });
    expect(marked['2026-08-01'].selected).toBeUndefined();
  });

  it('agrega el día seleccionado aunque no tenga seguimientos', () => {
    const marked = buildMarkedDates([], '2026-07-30');
    expect(marked['2026-07-30']).toMatchObject({ selected: true });
  });
});

describe('followUpsForDay', () => {
  it('filtra por día y ordena por hora', () => {
    const records = [
      rec('tarde', '2026-07-30T15:00:00'),
      rec('otroDia', '2026-07-31T09:00:00'),
      rec('manana', '2026-07-30T09:00:00'),
    ];
    const out = followUpsForDay(records, '2026-07-30');
    expect(out.map((r) => r.id)).toEqual(['manana', 'tarde']);
  });
});
