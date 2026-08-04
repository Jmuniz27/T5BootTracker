export function validateCedulaEcuatoriana(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;
  const digits = cedula.split('').map(Number);
  const province = digits[0] * 10 + digits[1];
  if (province < 1 || province > 24) return false;
  if (digits[2] >= 6) return false;
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let val = digits[i] * coefficients[i];
    if (val >= 10) val -= 9;
    sum += val;
  }
  const checkDigit = sum % 10 === 0 ? 0 : 10 - (sum % 10);
  return checkDigit === digits[9];
}

function mod11CheckDigit(digits: number[], coefficients: number[]): number | null {
  const sum = digits.reduce((acc, d, i) => acc + d * coefficients[i], 0);
  const r = sum % 11;
  const expected = r === 0 ? 0 : 11 - r;
  return expected === 10 ? null : expected;
}

export function validateRucEcuatoriano(ruc: string): boolean {
  if (!/^\d{13}$/.test(ruc)) return false;
  const digits = ruc.split('').map(Number);
  const province = digits[0] * 10 + digits[1];
  if (province < 1 || province > 24) return false;
  const thirdDigit = digits[2];
  if (thirdDigit <= 5) {
    return validateCedulaEcuatoriana(ruc.slice(0, 10)) && ruc.endsWith('001');
  }
  if (thirdDigit === 6) {
    const expected = mod11CheckDigit(digits.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]);
    return expected !== null && expected === digits[8];
  }
  if (thirdDigit === 9) {
    const expected = mod11CheckDigit(digits.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]);
    return expected !== null && expected === digits[9];
  }
  return false;
}

export function validateIdentificacion(value: string): boolean {
  if (value.length === 10) return validateCedulaEcuatoriana(value);
  if (value.length === 13) return validateRucEcuatoriano(value);
  return false;
}
