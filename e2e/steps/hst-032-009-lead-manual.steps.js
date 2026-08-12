import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { test } from './fixtures/vendedor.js'
import { telefonoUnico } from '../tests/support/users.js'
import { elegirOpcion, filaDeLead, abrirAccionesDeLead } from '../tests/support/selectors.js'

// Reutiliza texto y aserciones de tests/hst-032-009-lead-manual.spec.js.
const { Given, When, Then } = createBdd(test)

// Teléfono único por corrida: el rango del seed y los leads de corridas
// previas dispararían la validación de duplicados (CR-011). Compartido entre
// pasos dentro del mismo escenario (workers: 1, fullyParallel: false).
let telefono
let nombre

Given('un vendedor en el dashboard de leads', async ({ page }) => {
  telefono = telefonoUnico()
  nombre = `Lead E2E ${telefono.slice(-6)}`

  await page.goto('/dashboard')
  await expect(page.getByTestId('new-lead-button')).toBeVisible()
})

When('crea un lead manualmente y registra una interacción sobre él', async ({ page }) => {
  await page.getByTestId('new-lead-button').click()
  // El modal cierra al hacer click en el backdrop: confirmar que abrió antes
  // de escribir evita fallos confusos más abajo.
  await expect(page.getByRole('heading', { name: 'Nuevo lead' })).toBeVisible()

  await page.getByTestId('create-lead-name').fill(nombre)
  await page.getByTestId('create-lead-phone').fill(telefono)
  await page.getByTestId('create-lead-email').fill(`e2e-${telefono}@test.com`)
  await elegirOpcion(page, 'create-lead-source', 'Manual')

  // Registrar interacción exige que el lead sea propio.
  await page.getByTestId('create-lead-autoassign').check()
  await page.getByTestId('create-lead-submit').click()

  await expect(page.getByText('Lead creado y asignado a ti.')).toBeVisible()
  await page.getByTestId('tab-mine').click()
  await page.getByTestId('lead-search').fill(telefono)
  await expect(filaDeLead(page, telefono)).toBeVisible()
  await expect(filaDeLead(page, telefono)).toContainText(nombre)

  await abrirAccionesDeLead(page, telefono, nombre)
  await page.getByRole('button', { name: 'Registrar interacción' }).click()
  await expect(page.getByRole('heading', { name: 'Registrar interacción' })).toBeVisible()

  await elegirOpcion(page, 'interaction-type', 'Llamada')
  await elegirOpcion(page, 'interaction-outcome', 'Llamar de nuevo')
  await page.getByTestId('interaction-notes').fill('Primer contacto desde la suite de aceptación.')
  await page.getByTestId('interaction-submit').click()
})

Then('el lead aparece asignado a él con la interacción registrada', async ({ page }) => {
  await expect(page.getByText('Interacción registrada correctamente.')).toBeVisible()
})
