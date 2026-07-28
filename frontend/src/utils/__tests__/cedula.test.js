import { isValidCedula } from '../cedula';

describe('isValidCedula', () => {
  it.each(['0926687856', '1710034065', '0100000009'])('acepta la cédula válida %s', (cedula) => {
    expect(isValidCedula(cedula)).toBe(true);
  });

  it('rechaza una cédula con dígito verificador incorrecto', () => {
    expect(isValidCedula('0926687857')).toBe(false);
  });

  it('rechaza un código de provincia fuera de rango', () => {
    expect(isValidCedula('2526687856')).toBe(false);
  });

  it('rechaza un tercer dígito mayor o igual a 6', () => {
    expect(isValidCedula('0966687856')).toBe(false);
  });

  it.each([['', 'vacía'], ['123', 'muy corta'], ['09266878567', 'muy larga'], ['09266878ab', 'no numérica']])(
    'rechaza una cédula %s (%s)',
    (cedula) => {
      expect(isValidCedula(cedula)).toBe(false);
    },
  );

  it('rechaza null y undefined sin lanzar', () => {
    expect(isValidCedula(null)).toBe(false);
    expect(isValidCedula(undefined)).toBe(false);
  });
});
