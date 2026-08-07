import { describe, it, expect } from 'vitest';
import {
  LEAD_REPORT_COLUMNS,
  formatReportDate,
  flattenNote,
} from '../leadsReport';
import { buildRows, toCsv } from '../export';

const LEAD = {
  id: 'l-1',
  name: 'Ana Torres',
  phone: '0991112222',
  email: 'ana@test.com',
  source: 'INSTAGRAM',
  program_interest: 'Python Full Stack',
  status: 'INTERESTED',
  owner_name: 'Vendedor Uno',
  assigned_at: '2026-07-01T14:00:00Z',
  first_interaction_at: '2026-07-02T14:00:00Z',
  last_interaction_at: '2026-07-20T14:00:00Z',
  last_note: 'Quedó en confirmar el horario',
};

const cell = (row, header) => {
  const index = LEAD_REPORT_COLUMNS.findIndex((c) => c.header === header);
  return buildRows([row], LEAD_REPORT_COLUMNS)[0][index];
};

describe('formatReportDate', () => {
  it('deja la celda vacía cuando no hay fecha', () => {
    // Un lead sin interacciones llega con null en las tres fechas.
    expect(formatReportDate(null)).toBe('');
    expect(formatReportDate(undefined)).toBe('');
    expect(formatReportDate('')).toBe('');
  });

  it('no imprime "Invalid Date" con basura', () => {
    expect(formatReportDate('no es una fecha')).toBe('');
  });

  it('formatea una fecha real', () => {
    expect(formatReportDate('2026-07-20T14:00:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe('flattenNote', () => {
  it('colapsa saltos de línea para que no rompan la fila del PDF', () => {
    expect(flattenNote('primera\nsegunda\n\ntercera')).toBe('primera segunda tercera');
  });

  it('devuelve vacío cuando no hay comentario', () => {
    expect(flattenNote(null)).toBe('');
  });
});

describe('columnas del reporte de leads', () => {
  it('incluye las que pidió la clienta', () => {
    const headers = LEAD_REPORT_COLUMNS.map((c) => c.header);
    expect(headers).toEqual([
      'Nombre',
      'Teléfono',
      'Correo',
      'Fuente',
      'Programa de interés',
      'Estado',
      'Vendedor',
      'Fecha de asignación',
      'Primera interacción',
      'Última interacción',
      'Último comentario',
    ]);
  });

  it('traduce fuente y estado a lo que se lee en pantalla', () => {
    expect(cell(LEAD, 'Fuente')).toBe('Instagram');
    expect(cell(LEAD, 'Estado')).toBe('Interesado');
  });

  it('un lead sin vendedor lo dice en vez de dejar la celda vacía', () => {
    expect(cell({ ...LEAD, owner_name: null }, 'Vendedor')).toBe('Sin asignar');
  });

  it('un lead sin interacciones exporta las tres fechas vacías', () => {
    const sinContacto = {
      ...LEAD,
      assigned_at: null,
      first_interaction_at: null,
      last_interaction_at: null,
      last_note: null,
    };
    expect(cell(sinContacto, 'Fecha de asignación')).toBe('');
    expect(cell(sinContacto, 'Primera interacción')).toBe('');
    expect(cell(sinContacto, 'Última interacción')).toBe('');
    expect(cell(sinContacto, 'Último comentario')).toBe('');
  });

  it('el correo vacío no imprime null', () => {
    expect(cell({ ...LEAD, email: null }, 'Correo')).toBe('');
  });
});

describe('CSV del reporte', () => {
  it('conserva acentos y ñ', () => {
    const csv = toCsv([{ ...LEAD, name: 'Ñandú Peña', last_note: 'Sí, confirmó' }], LEAD_REPORT_COLUMNS);
    expect(csv).toContain('Ñandú Peña');
    expect(csv).toContain('Sí, confirmó');
    expect(csv).toContain('Programa de interés');
  });

  it('entrecomilla el comentario que trae comas', () => {
    const csv = toCsv([{ ...LEAD, last_note: 'Dijo esto, y también aquello' }], LEAD_REPORT_COLUMNS);
    expect(csv).toContain('"Dijo esto, y también aquello"');
  });

  it('neutraliza una celda que Excel interpretaría como fórmula', () => {
    const csv = toCsv([{ ...LEAD, name: '=1+1' }], LEAD_REPORT_COLUMNS);
    expect(csv).toContain("'=1+1");
  });
});
