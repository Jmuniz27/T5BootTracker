import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { test } from './fixtures/vendedor.js'
import { LEADS_DISPONIBLES } from '../tests/support/users.js'
import { filaDeLead, abrirAccionesDeLead } from '../tests/support/selectors.js'
import { clienteApi, buscarLeadPorTelefono, fijarAutoAsignacion, liberarLeadSiAsignado } from '../tests/support/api.js'

// Reutiliza texto y aserciones de tests/hst-007-auto-asignacion.spec.js.
const { Given, When, Then } = createBdd(test)

// Lead del seed sin dueño (índices 5-9). Los 0-4 nacen asignados a vendedor1.
const TELEFONO = LEADS_DISPONIBLES[0]
const NOMBRE = 'Innovatech Cía.'

Given('un lead disponible y la auto-asignación habilitada', async ({ page }) => {
  // Precondiciones idempotentes: el feature debe poder correr dos veces
  // seguidas contra la misma base sin chocar con 409 LEAD_ALREADY_ASSIGNED.
  const apiAdmin = await clienteApi('admin')
  await fijarAutoAsignacion(apiAdmin, true)

  const lead = await buscarLeadPorTelefono(apiAdmin, TELEFONO)
  expect(lead, `el lead ${TELEFONO} debería existir; ¿corrió seed_dev?`).toBeTruthy()
  if (lead.owner) await liberarLeadSiAsignado(apiAdmin, lead.id)

  await apiAdmin.dispose()

  // Fijada arriba vía API (CR-004: sólo el Administrador puede cambiarla).
  await page.goto('/dashboard')
  await expect(page.getByTestId('tab-available')).toBeVisible()

  await page.getByTestId('tab-available').click()
  await page.getByTestId('lead-search').fill(TELEFONO)
  await expect(filaDeLead(page, TELEFONO)).toBeVisible()
})

When('el vendedor pulsa "Asignarme" sobre ese lead', async ({ page }) => {
  await abrirAccionesDeLead(page, TELEFONO, NOMBRE)
  await page.getByRole('button', { name: 'Asignarme' }).click()
})

Then('el lead queda a su nombre y sale de la lista de disponibles', async ({ page }) => {
  await expect(page.getByText('Lead asignado correctamente.')).toBeVisible()

  await page.getByTestId('tab-mine').click()
  await page.getByTestId('lead-search').fill(TELEFONO)
  await expect(filaDeLead(page, TELEFONO)).toBeVisible()

  await page.getByTestId('tab-available').click()
  await page.getByTestId('lead-search').fill(TELEFONO)
  await expect(filaDeLead(page, TELEFONO)).toHaveCount(0)
})
