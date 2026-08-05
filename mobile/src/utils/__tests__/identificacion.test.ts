import {
  validateCedulaEcuatoriana,
  validateRucEcuatoriano,
  validateIdentificacion,
} from '../identificacion';

describe('validateCedulaEcuatoriana', () => {
  it.each(['0926687856', '1710034065', '0100000009'])('acepta la cédula válida %s', (cedula) => {
    expect(validateCedulaEcuatoriana(cedula)).toBe(true);
  });

  it('rechaza un dígito verificador incorrecto', () => {
    expect(validateCedulaEcuatoriana('0926687857')).toBe(false);
  });

  it('rechaza un código de provincia fuera de rango', () => {
    expect(validateCedulaEcuatoriana('2526687856')).toBe(false);
  });

  it('rechaza un tercer dígito mayor o igual a 6', () => {
    expect(validateCedulaEcuatoriana('0966687856')).toBe(false);
  });

  it.each(['', '123', '09266878567', '09266878ab'])('rechaza una cédula inválida: %s', (cedula) => {
    expect(validateCedulaEcuatoriana(cedula)).toBe(false);
  });
});

describe('validateRucEcuatoriano', () => {
  it.each(['0926687856001', '1710034065001'])('acepta el RUC de persona natural %s', (ruc) => {
    expect(validateRucEcuatoriano(ruc)).toBe(true);
  });

  it('acepta un RUC de sociedad pública válido (tercer dígito 6)', () => {
    expect(validateRucEcuatoriano('1760015180001')).toBe(true);
  });

  it('acepta un RUC de sociedad privada válido (tercer dígito 9)', () => {
    expect(validateRucEcuatoriano('1790012301001')).toBe(true);
  });

  it('rechaza un RUC de persona natural que no termina en 001', () => {
    expect(validateRucEcuatoriano('0926687856002')).toBe(false);
  });

  it('rechaza un tercer dígito 7 u 8 (no asignado)', () => {
    expect(validateRucEcuatoriano('1780012345001')).toBe(false);
  });

  it.each(['', '123', '09266878560012', '092668785600a'])('rechaza un RUC inválido: %s', (ruc) => {
    expect(validateRucEcuatoriano(ruc)).toBe(false);
  });
});

describe('validateIdentificacion', () => {
  it('valida como cédula cuando tiene 10 dígitos', () => {
    expect(validateIdentificacion('0926687856')).toBe(true);
    expect(validateIdentificacion('0926687857')).toBe(false);
  });

  it('valida como RUC cuando tiene 13 dígitos', () => {
    expect(validateIdentificacion('0926687856001')).toBe(true);
    expect(validateIdentificacion('0926687856002')).toBe(false);
  });

  it('rechaza cualquier otra longitud', () => {
    expect(validateIdentificacion('123')).toBe(false);
    expect(validateIdentificacion('')).toBe(false);
  });
});
