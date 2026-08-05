// Aplana errores de validación DRF ({"receipt_file": [...], "program_id": [...]})
// a un mensaje legible. Los errores con clave "error" (formato propio del backend)
// se devuelven tal cual; sin eso, siempre caía al mensaje genérico y se perdía
// el motivo real (tipo de archivo, tamaño, programa inválido).
export function flattenUploadError(error, fallback = 'Error al subir el comprobante.') {
  const data = error?.response?.data
  if (!data) return fallback
  if (typeof data.error === 'string') return data.error

  const messages = Object.values(data)
    .flat()
    .filter((v) => typeof v === 'string')

  return messages.length > 0 ? messages.join(' ') : fallback
}
