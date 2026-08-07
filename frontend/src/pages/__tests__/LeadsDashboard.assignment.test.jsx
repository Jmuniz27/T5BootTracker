import { describe, it, expect } from 'vitest';
import { assignmentLabel } from '../LeadsDashboard';

const ASIGNADO = {
  owner: 'u-1',
  owner_name: 'Vendedor Uno',
  assigned_at: '2026-07-01T15:00:00Z',
  days_assigned: 12,
};

describe('assignmentLabel', () => {
  it('dice quién lo tiene, desde cuándo y cuántos días lleva', () => {
    const texto = assignmentLabel(ASIGNADO);

    expect(texto).toContain('Vendedor Uno');
    expect(texto).toContain('2026');
    expect(texto).toContain('12 días');
  });

  it('un lead sin dueño lo dice explícitamente', () => {
    expect(assignmentLabel({ owner: null, owner_name: null, assigned_at: null })).toBe('Sin asignar');
  });

  it('no imprime "Invalid Date" si la fecha viene rota', () => {
    const texto = assignmentLabel({ ...ASIGNADO, assigned_at: 'basura' });

    expect(texto).toBe('Vendedor Uno');
    expect(texto).not.toMatch(/invalid/i);
  });

  it('un lead asignado sin fecha sellada muestra sólo el vendedor', () => {
    // Pasa con los leads que ya existían antes de que se sellara assigned_at.
    expect(assignmentLabel({ ...ASIGNADO, assigned_at: null })).toBe('Vendedor Uno');
  });

  it('concuerda el singular', () => {
    expect(assignmentLabel({ ...ASIGNADO, days_assigned: 1 })).toContain('1 día');
    expect(assignmentLabel({ ...ASIGNADO, days_assigned: 1 })).not.toContain('1 días');
  });

  it('el día cero se muestra igual, no se esconde', () => {
    // Un lead asignado hoy tiene days_assigned = 0; el operador ?? lo deja pasar
    // y un || lo habría tratado como ausente.
    expect(assignmentLabel({ ...ASIGNADO, days_assigned: 0 })).toContain('0 días');
  });
});
