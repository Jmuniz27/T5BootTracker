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
