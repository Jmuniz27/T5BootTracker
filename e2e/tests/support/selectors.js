import { expect } from '@playwright/test'

/**
 * Abre un CustomSelect y elige una opción por su etiqueta visible.
 *
 * CustomSelect no es un <select> nativo ni expone roles ARIA, así que
 * `selectOption()` y `getByRole('option')` no aplican: es un <button> que
 * despliega una <ul>. El componente marca el disparador con `data-testid` y
 * cada opción con `${testId}-option`.
 */
export async function elegirOpcion(page, testId, etiqueta) {
  await page.getByTestId(testId).click()
  const opcion = page.getByTestId(`${testId}-option`).filter({ hasText: etiqueta })
  await expect(opcion.first()).toBeVisible()
  await opcion.first().click()
  // La lista se desmonta al elegir; esperarlo evita que el siguiente click
  // caiga sobre una opción que todavía está en pantalla.
  await expect(page.getByTestId(`${testId}-option`)).toHaveCount(0)
}

/**
 * Fila de un lead, anclada en el teléfono: es la clave única y estable del
 * seed. Anclar por nombre o por índice de fila rompe al cambiar el orden.
 */
export function filaDeLead(page, telefono) {
  return page.locator(`[data-testid="lead-row"][data-lead-phone="${telefono}"]`)
}

/**
 * Abre el menú de acciones de una fila. El menú se posiciona con `fixed` a
 * coordenadas calculadas y se voltea cerca del borde inferior, así que la
 * fila debe estar a la vista antes de abrirlo.
 */
export async function abrirAccionesDeLead(page, telefono, nombreLead) {
  const fila = filaDeLead(page, telefono)
  await fila.scrollIntoViewIfNeeded()
  await fila.getByRole('button', { name: `Acciones para ${nombreLead}` }).click()
}
