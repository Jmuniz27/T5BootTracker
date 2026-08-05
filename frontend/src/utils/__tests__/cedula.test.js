import { isValidCedula, isValidRuc, isValidIdentificacion } from '../cedula';

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

describe('isValidRuc', () => {
  it.each(['0926687856001', '1710034065001'])('acepta el RUC de persona natural %s', (ruc) => {
    expect(isValidRuc(ruc)).toBe(true);
  });

  it('acepta un RUC de sociedad pública válido (tercer dígito 6)', () => {
    expect(isValidRuc('1760015180001')).toBe(true);
  });

  it('acepta un RUC de sociedad privada válido (tercer dígito 9)', () => {
    expect(isValidRuc('1790012301001')).toBe(true);
  });

  it('rechaza un RUC de persona natural que no termina en 001', () => {
    expect(isValidRuc('0926687856002')).toBe(false);
  });

  it('rechaza un tercer dígito 7 u 8 (no asignado)', () => {
    expect(isValidRuc('1780012345001')).toBe(false);
  });

  it.each([['', 'vacía'], ['123', 'muy corta'], ['09266878560012', 'muy larga'], ['092668785600a', 'no numérica']])(
    'rechaza un RUC %s (%s)',
    (ruc) => {
      expect(isValidRuc(ruc)).toBe(false);
    },
  );

  it('rechaza null y undefined sin lanzar', () => {
    expect(isValidRuc(null)).toBe(false);
    expect(isValidRuc(undefined)).toBe(false);
  });
});

describe('isValidIdentificacion', () => {
  it('valida como cédula cuando tiene 10 dígitos', () => {
    expect(isValidIdentificacion('0926687856')).toBe(true);
    expect(isValidIdentificacion('0926687857')).toBe(false);
  });

  it('valida como RUC cuando tiene 13 dígitos', () => {
    expect(isValidIdentificacion('0926687856001')).toBe(true);
    expect(isValidIdentificacion('0926687856002')).toBe(false);
  });

  it('rechaza cualquier otra longitud', () => {
    expect(isValidIdentificacion('123')).toBe(false);
    expect(isValidIdentificacion('')).toBe(false);
  });
});
