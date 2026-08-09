/**
 * Rangos de fechas relativos para los filtros de analítica.
 *
 * Vive en su propio módulo y no en el componente porque exportar funciones desde
 * un archivo de componentes rompe el fast refresh de Vite (ver lib/leadDisplay.js).
 */

/**
 * Fecha de corte en YYYY-MM-DD, o `null` para no acotar.
 *
 * Se arma a mano en vez de usar `toISOString()`: ese convierte a UTC y en un
 * huso negativo —Ecuador es UTC-5— devolvería el día anterior, corriendo el
 * rango un día hacia atrás.
 *
 * @param days   días hacia atrás; vacío o 0 devuelve null
 * @param today  hoy, inyectable para poder testearlo
 */
export function rangeStartDate(days, today = new Date()) {
  if (!days) return null

  const desde = new Date(today)
  desde.setDate(desde.getDate() - Number(days))

  const pad = (n) => String(n).padStart(2, '0')
  return `${desde.getFullYear()}-${pad(desde.getMonth() + 1)}-${pad(desde.getDate())}`
}
