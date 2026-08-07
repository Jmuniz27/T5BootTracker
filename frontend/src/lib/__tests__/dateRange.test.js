import { describe, it, expect } from 'vitest';
import { rangeStartDate } from '../dateRange';

describe('rangeStartDate', () => {
  it('sin días no acota', () => {
    expect(rangeStartDate('')).toBeNull();
    expect(rangeStartDate(0)).toBeNull();
    expect(rangeStartDate(undefined)).toBeNull();
  });

  it('resta los días pedidos', () => {
    expect(rangeStartDate('90', new Date(2026, 7, 7))).toBe('2026-05-09');
  });

  it('el último año cae en la misma fecha del año anterior', () => {
    expect(rangeStartDate('365', new Date(2026, 7, 7))).toBe('2025-08-07');
  });

  it('cruza el año hacia atrás sin romperse', () => {
    expect(rangeStartDate('90', new Date(2026, 1, 15))).toBe('2025-11-17');
  });

  it('no corre el día por el huso horario', () => {
    // toISOString() habría devuelto el día anterior con una fecha local de
    // madrugada en UTC-5, y el rango entero se corría con él.
    const madrugada = new Date(2026, 7, 7, 1, 30);
    expect(rangeStartDate('1', madrugada)).toBe('2026-08-06');
  });

  it('acepta el número además del string', () => {
    expect(rangeStartDate(180, new Date(2026, 7, 7))).toBe(rangeStartDate('180', new Date(2026, 7, 7)));
  });
});
