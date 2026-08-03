import { test } from '@playwright/test'

/**
 * Compone el título de un escenario de aceptación en formato
 * Dado/Cuando/Entonces citando su HST.
 *
 * Devuelve el string en lugar de declarar el test: si el `test()` se llamara
 * desde aquí, Playwright atribuiría todos los escenarios a este archivo y el
 * reporte perdería a qué HST pertenece cada uno. Cada spec declara su test y
 * usa este helper sólo para el título, que es lo que leen el reporte HTML,
 * el JUnit XML y quien revise la evidencia de aceptación.
 */
export function titulo({ hst, dado, cuando, entonces }) {
  return `${hst} · Dado ${dado}, Cuando ${cuando}, Entonces ${entonces}`
}

/** Cláusulas: se renderizan anidadas y cronometradas en el reporte. */
export const dado = (descripcion, fn) => test.step(`Dado ${descripcion}`, fn)
export const y = (descripcion, fn) => test.step(`Y ${descripcion}`, fn)
export const cuando = (descripcion, fn) => test.step(`Cuando ${descripcion}`, fn)
export const entonces = (descripcion, fn) => test.step(`Entonces ${descripcion}`, fn)
