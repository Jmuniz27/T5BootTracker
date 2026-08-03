const FORM_FIELDS = ['first_name', 'last_name', 'email', 'role', 'cedula', 'phone', 'password']

/**
 * DRF devuelve errores por campo (`{email: ["..."]}`) y también mensajes sueltos
 * (`detail` / `error`). Los de campo se pintan bajo su input; el resto se
 * devuelve para mostrarlo como mensaje general del formulario.
 *
 * `fields` permite reutilizarlo desde otros formularios: sin él sólo se mapean
 * los campos del formulario de usuarios.
 *
 * Returns:
 *   El mensaje general a mostrar, o `null` si el error completo quedó pintado
 *   bajo sus campos.
 */
export function applyServerErrors(error, setError, fields = FORM_FIELDS) {
  const data = error?.response?.data

  if (!data || typeof data !== 'object') {
    return 'No se pudo completar la operación. Intenta de nuevo.'
  }

  let matchedField = false
  fields.forEach((field) => {
    const message = data[field]
    if (!message) return
    matchedField = true
    setError(field, { type: 'server', message: Array.isArray(message) ? message[0] : String(message) })
  })

  const general = data.detail ?? data.error ?? data.non_field_errors
  if (general) return Array.isArray(general) ? general[0] : String(general)

  return matchedField ? null : 'No se pudo completar la operación. Intenta de nuevo.'
}

/** Mensaje plano para acciones sin formulario (toggle, reset de contraseña). */
export function errorMessage(error, fallback) {
  const data = error?.response?.data
  const message = data?.detail ?? data?.error
  if (Array.isArray(message)) return message[0]
  return message ? String(message) : fallback
}
