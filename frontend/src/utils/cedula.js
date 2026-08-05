/**
 * Validación de cédula ecuatoriana (algoritmo módulo 10).
 *
 * Espejo de `backend/apps/authentication/validators.py::validate_cedula_ecuatoriana`.
 * Acá vive solo para dar feedback inmediato en el formulario — el backend sigue
 * siendo la autoridad. Si cambia la regla, hay que cambiar ambos lados.
 */
export function isValidCedula(cedula) {
  if (!/^\d{10}$/.test(cedula ?? '')) return false

  const provincia = Number(cedula.slice(0, 2))
  if (provincia < 1 || provincia > 24) return false
  if (Number(cedula[2]) >= 6) return false

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  const suma = coeficientes.reduce((acc, coef, i) => {
    const v = Number(cedula[i]) * coef
    return acc + (v >= 10 ? v - 9 : v)
  }, 0)

  const digitoVerificador = Number(cedula[9])
  const resto = suma % 10
  return resto === 0 ? digitoVerificador === 0 : 10 - resto === digitoVerificador
}

function mod11CheckDigit(digits, coefficients) {
  const sum = digits.reduce((acc, d, i) => acc + d * coefficients[i], 0)
  const r = sum % 11
  const expected = r === 0 ? 0 : 11 - r
  return expected === 10 ? null : expected
}

/**
 * Validación de RUC ecuatoriano (persona natural, sociedad pública o privada).
 *
 * Espejo de `backend/apps/authentication/validators.py::validate_ruc`.
 */
export function isValidRuc(ruc) {
  if (!/^\d{13}$/.test(ruc ?? '')) return false
  const digits = ruc.split('').map(Number)
  const province = digits[0] * 10 + digits[1]
  if (province < 1 || province > 24) return false
  const thirdDigit = digits[2]
  if (thirdDigit <= 5) {
    return isValidCedula(ruc.slice(0, 10)) && ruc.endsWith('001')
  }
  if (thirdDigit === 6) {
    const expected = mod11CheckDigit(digits.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2])
    return expected !== null && expected === digits[8]
  }
  if (thirdDigit === 9) {
    const expected = mod11CheckDigit(digits.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2])
    return expected !== null && expected === digits[9]
  }
  return false
}

/**
 * Cédula (10 dígitos) o RUC (13 dígitos) ecuatoriano.
 *
 * Espejo de `backend/apps/authentication/validators.py::validate_identificacion`.
 */
export function isValidIdentificacion(value) {
  const v = value ?? ''
  if (v.length === 10) return isValidCedula(v)
  if (v.length === 13) return isValidRuc(v)
  return false
}
