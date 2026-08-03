import { emptyMeetingForm, meetingToForm, formToPayload } from '../meeting-form';
import type { Meeting } from '../../api/meetings.api';

describe('emptyMeetingForm', () => {
  it('arranca mañana 9:00, 30 min, invitar activado', () => {
    const f = emptyMeetingForm();
    expect(f.start.getHours()).toBe(9);
    expect(f.end.getTime() - f.start.getTime()).toBe(30 * 60 * 1000);
    expect(f.notifyLead).toBe(true);
    expect(f.title).toBe('');
    expect(f.lead).toBe('');
  });
});

describe('meetingToForm', () => {
  it('carga los campos de una reunión existente', () => {
    const m: Meeting = {
      id: 'm1',
      title: 'Reunión Ana',
      description: 'notas',
      start_time: '2026-08-05T14:00:00.000Z',
      end_time: '2026-08-05T14:30:00.000Z',
      lead: 'lead-1',
      assigned_to: 'u1',
      google_event_id: null,
      created_at: '2026-08-01T00:00:00.000Z',
    };
    const f = meetingToForm(m, 'Ana Torres');
    expect(f.title).toBe('Reunión Ana');
    expect(f.description).toBe('notas');
    expect(f.lead).toBe('lead-1');
    expect(f.leadName).toBe('Ana Torres');
    expect(f.start.toISOString()).toBe('2026-08-05T14:00:00.000Z');
  });
});

describe('formToPayload', () => {
  const base = () => ({
    title: 'Reunión',
    description: 'algo',
    start: new Date('2026-08-05T14:00:00.000Z'),
    end: new Date('2026-08-05T14:30:00.000Z'),
    lead: 'lead-1',
    leadName: 'Ana',
    notifyLead: true,
  });

  it('arma el payload con fechas ISO', () => {
    const p = formToPayload(base());
    expect(p).toEqual({
      title: 'Reunión',
      description: 'algo',
      start_time: '2026-08-05T14:00:00.000Z',
      end_time: '2026-08-05T14:30:00.000Z',
      lead: 'lead-1',
      notify_lead: true,
    });
  });

  it('devuelve null sin título o sin lead', () => {
    expect(formToPayload({ ...base(), title: '  ' })).toBeNull();
    expect(formToPayload({ ...base(), lead: '' })).toBeNull();
  });

  it('devuelve null si el fin no es posterior al inicio', () => {
    const v = base();
    v.end = new Date('2026-08-05T14:00:00.000Z');
    expect(formToPayload(v)).toBeNull();
  });
});
