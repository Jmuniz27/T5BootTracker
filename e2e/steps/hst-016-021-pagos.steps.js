import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from './fixtures/bootcamper.js'
import { clienteApi } from '../tests/support/api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COMPROBANTE = path.join(__dirname, '..', 'fixtures', 'comprobante-test.png')

// Reutiliza texto y aserciones de tests/hst-016-021-pagos.spec.js. El OCR
// corre en Celery y puede tardar más que el presupuesto de 30 s que usa la
// propia pantalla; darle margen al escenario completo.
const { Given, When, Then } = createBdd(test)

// Compartido entre When y Then dentro del mismo escenario. La suite corre
// con workers: 1 y fullyParallel: false (ver playwright.config.js), así que
// no hay riesgo de que dos escenarios lo pisen a la vez.
let pagoId

Given('un bootcamper con un comprobante de transferencia', async ({ page }) => {
  test.setTimeout(150_000)
  await page.goto('/payments')
  await expect(page.getByTestId('upload-button')).toBeVisible()
})

When('lo sube, el sistema lo procesa y Finanzas lo aprueba', async ({ page }) => {
  await page.getByTestId('upload-button').click()
  await expect(page.getByRole('heading', { name: /Subir comprobante/ })).toBeVisible()

  await page.getByTestId('upload-file-input').setInputFiles(COMPROBANTE)
  // Ya no se elige programa: el backend lo deduce de la inscripción activa.
  await page.getByTestId('upload-submit').click()

  // La pantalla entra en estado de escaneo mientras corre la tarea Celery.
  await expect(page.getByTestId('ocr-processing')).toBeVisible()

  // La espera autoritativa va contra la API, no contra el spinner: la
  // pantalla se rinde a los 30 s y lo oculta igual, con lo que esperar sólo
  // su desaparición daría un falso verde si el OCR nunca terminó.
  const api = await clienteApi('bootcamper')
  const historial = await api.get('/api/payments/my-history/')
  expect(historial.ok(), 'debería poder leerse el historial de pagos').toBeTruthy()
  const cuerpo = await historial.json()
  const pagos = cuerpo.results ?? cuerpo
  const borrador = pagos.find((p) => p.status === 'DRAFT')
  expect(borrador, 'el pago recién subido debería existir en estado DRAFT').toBeTruthy()
  pagoId = borrador.id

  await expect
    .poll(
      async () => {
        const r = await api.get(`/api/payments/my-payments/${pagoId}/ocr-status/`)
        if (!r.ok()) return 0
        const d = await r.json()
        return Object.keys(d.ocr_confidence ?? {}).length
      },
      {
        timeout: 90_000,
        intervals: [1000],
        message: 'el OCR debería completarse y escribir ocr_confidence',
      },
    )
    .toBeGreaterThan(0)

  await api.dispose()

  // Al terminar el OCR el spinner desaparece; si en cambio apareció el
  // aviso de expiración, el OCR no cumplió y el escenario debe fallar.
  await expect(page.getByTestId('ocr-processing')).toBeHidden({ timeout: 45_000 })
  await expect(page.getByTestId('ocr-timeout')).toHaveCount(0)

  await page.getByTestId('confirm-payment-submit').click()

  // La validación de comprobantes es de Finanzas: al vendedor la API le
  // responde 403 en los endpoints de pagos.
  //
  // PaymentApproveView rechaza con 400 NOT_PENDING si el pago no pasó a
  // PENDING, así que el confirm anterior debe haberse completado.
  const apiFinanzas = await clienteApi('finanzas')
  await expect
    .poll(
      async () => {
        const r = await apiFinanzas.get(`/api/payments/${pagoId}/`)
        if (!r.ok()) return null
        return (await r.json()).status
      },
      { timeout: 30_000, intervals: [1000], message: 'el pago debería quedar en PENDING' },
    )
    .toBe('PENDING')

  const aprobacion = await apiFinanzas.patch(`/api/payments/${pagoId}/approve/`, {
    data: { confirmed_amount: '450.00' },
  })
  expect(
    aprobacion.ok(),
    `la aprobación falló: ${aprobacion.status()} ${await aprobacion.text()}`,
  ).toBeTruthy()

  await apiFinanzas.dispose()
})

Then('el pago queda aprobado con el monto confirmado', async () => {
  const apiFinanzas = await clienteApi('finanzas')
  const detalle = await apiFinanzas.get(`/api/payments/${pagoId}/`)
  const pago = await detalle.json()
  expect(pago.status).toBe('APPROVED')
  expect(Number(pago.confirmed_amount)).toBe(450)
  await apiFinanzas.dispose()
})
