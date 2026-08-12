import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { test } from './fixtures/vendedor.js'
import { LEADS_DE_VENDEDOR1, PROGRAMA_PRINCIPAL } from '../tests/support/users.js'
import { elegirOpcion, filaDeLead, abrirAccionesDeLead } from '../tests/support/selectors.js'
import { clienteApi, buscarLeadPorTelefono, fijarEstadoDeLead } from '../tests/support/api.js'

// Reutiliza texto y aserciones de tests/hst-013-conversion.spec.js.
const { Given, When, Then } = createBdd(test)

// Lead propio de vendedor1. "Convertir lead" sólo aparece si isOwned y el
// estado es QUALIFIED, así que el estado se fija como precondición: el seed
// lo asigna por índice y no es un contrato del que se pueda depender.
const TELEFONO = LEADS_DE_VENDEDOR1[2]
const NOMBRE = 'Tech Corp S.A.'

// Cédulas verificadas contra el algoritmo de validateCedulaEcuatoriana().
// La válida no es la del seed (1713175071) a propósito: esa ya pertenece a
// bootcamper.conv@ y dispararía el flujo de bootcamper recurrente.
const CEDULA_INVALIDA = '1234567890'
const CEDULA_VALIDA = '1710034065'

Given('un lead calificado asignado al vendedor', async ({ page }) => {
  const apiVendedor = await clienteApi('vendedor')
  const lead = await buscarLeadPorTelefono(apiVendedor, TELEFONO)
  expect(lead, `el lead ${TELEFONO} debería existir; ¿corrió seed_dev?`).toBeTruthy()

  if (lead.status === 'CONVERTED') {
    test.skip(true, `El lead ${TELEFONO} ya fue convertido en una corrida previa. Recrear la base: docker compose down -v`)
  }
  await fijarEstadoDeLead(apiVendedor, lead.id, 'QUALIFIED')
  await apiVendedor.dispose()

  await page.goto('/dashboard')
  await page.getByTestId('tab-mine').click()
  await page.getByTestId('lead-search').fill(TELEFONO)
  await expect(filaDeLead(page, TELEFONO)).toBeVisible()

  await abrirAccionesDeLead(page, TELEFONO, NOMBRE)
  await page.getByRole('button', { name: 'Convertir lead' }).click()
  await expect(page.getByRole('heading', { name: 'Convertir lead' })).toBeVisible()
})

When('lo convierte a bootcamper indicando una cédula ecuatoriana válida', async ({ page }) => {
  await page.getByTestId('convert-cedula').fill(CEDULA_INVALIDA)
  await elegirOpcion(page, 'convert-program', PROGRAMA_PRINCIPAL)
  await page.getByTestId('convert-submit').click()
})

Then('el sistema rechaza la cédula inválida y completa la conversión con la válida', async ({ page }) => {
  await expect(page.getByText('Cédula o RUC ecuatoriano inválido.')).toBeVisible()
  // El modal sigue abierto: la conversión no se ejecutó.
  await expect(page.getByRole('heading', { name: 'Convertir lead' })).toBeVisible()

  await page.getByTestId('convert-cedula').fill(CEDULA_VALIDA)
  await expect(page.getByText('✓ Cédula válida')).toBeVisible()
  // Cohorte y descuento son obligatorios para convertir.
  await elegirOpcion(page, 'convert-cohort', 'Cohorte 3')
  await page.getByTestId('convert-discount').fill('0')
  await page.getByTestId('convert-submit').click()

  // La conversión exitosa muestra el modal de resultado, no un toast.
  await expect(page.getByRole('heading', { name: '¡Lead convertido!' })).toBeVisible()
  await expect(page.getByText('ahora es Bootcamper.')).toBeVisible()

  // Ya no se muestra ninguna contraseña: el bootcamper activa su cuenta
  // por el link de invitación (#253/#257).
  await expect(page.getByText('Contraseña temporal')).not.toBeVisible()
  const inputLink = page.locator('input[value*="/onboarding/"]')
  await expect(inputLink).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copiar' })).toBeVisible()
})

Given('un lead recién convertido cuyo bootcamper sigue sin activar la cuenta', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByTestId('tab-converted').click()
  await page.getByTestId('lead-search').fill(TELEFONO)
  await expect(filaDeLead(page, TELEFONO)).toBeVisible()
})

When('el vendedor reenvía la invitación', async ({ page }) => {
  await abrirAccionesDeLead(page, TELEFONO, NOMBRE)
  await page.getByRole('button', { name: 'Reenviar invitación' }).click()
  await expect(page.getByRole('heading', { name: 'Reenviar invitación' })).toBeVisible()
  await page.getByRole('button', { name: 'Reenviar', exact: true }).click()
})

Then('recibe un link nuevo para compartir', async ({ page }) => {
  const inputLink = page.locator('input[value*="/onboarding/"]')
  await expect(inputLink).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copiar' })).toBeVisible()
})
