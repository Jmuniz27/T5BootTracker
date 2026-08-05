import { test, expect } from '@playwright/test'
import { titulo, dado, y, cuando, entonces } from './support/gwt.js'
import { STORAGE_STATE, LEADS_DE_VENDEDOR1, PROGRAMA_PRINCIPAL } from './support/users.js'
import { elegirOpcion, filaDeLead, abrirAccionesDeLead } from './support/selectors.js'
import { clienteApi, buscarLeadPorTelefono, fijarEstadoDeLead } from './support/api.js'

test.use({ storageState: STORAGE_STATE.vendedor })

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

test.describe('HST-013 · Conversión de lead a bootcamper con validación de cédula', () => {
  test.beforeAll(async () => {
    const apiVendedor = await clienteApi('vendedor')
    const lead = await buscarLeadPorTelefono(apiVendedor, TELEFONO)
    expect(lead, `el lead ${TELEFONO} debería existir; ¿corrió seed_dev?`).toBeTruthy()

    if (lead.status === 'CONVERTED') {
      test.skip(true, `El lead ${TELEFONO} ya fue convertido en una corrida previa. Recrear la base: docker compose down -v`)
    }
    await fijarEstadoDeLead(apiVendedor, lead.id, 'QUALIFIED')
    await apiVendedor.dispose()
  })

  test(
    titulo({
      hst: 'HST-013',
      dado: 'un lead calificado asignado al vendedor',
      cuando: 'lo convierte a bootcamper indicando una cédula ecuatoriana válida',
      entonces: 'el sistema rechaza la cédula inválida y completa la conversión con la válida',
    }),
    async ({ page }) => {
      await dado('que el vendedor tiene un lead calificado a su nombre', async () => {
        await page.goto('/dashboard')
        await page.getByTestId('tab-mine').click()
        await page.getByTestId('lead-search').fill(TELEFONO)
        await expect(filaDeLead(page, TELEFONO)).toBeVisible()
      })

      await y('abre el formulario de conversión', async () => {
        await abrirAccionesDeLead(page, TELEFONO, NOMBRE)
        await page.getByRole('button', { name: 'Convertir lead' }).click()
        await expect(page.getByRole('heading', { name: 'Convertir lead' })).toBeVisible()
      })

      await cuando('intenta convertirlo con una cédula inválida', async () => {
        await page.getByTestId('convert-cedula').fill(CEDULA_INVALIDA)
        await elegirOpcion(page, 'convert-program', PROGRAMA_PRINCIPAL)
        await page.getByTestId('convert-submit').click()
      })

      await entonces('el sistema rechaza la cédula y no convierte el lead', async () => {
        await expect(page.getByText('Cédula o RUC ecuatoriano inválido.')).toBeVisible()
        // El modal sigue abierto: la conversión no se ejecutó.
        await expect(page.getByRole('heading', { name: 'Convertir lead' })).toBeVisible()
      })

      await y('al corregirla por una cédula válida, la conversión se completa', async () => {
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
    },
  )

  test(
    titulo({
      hst: 'HST-013',
      dado: 'un lead recién convertido cuyo bootcamper sigue sin activar la cuenta',
      cuando: 'el vendedor reenvía la invitación',
      entonces: 'recibe un link nuevo para compartir',
    }),
    async ({ page }) => {
      await dado('que el vendedor ve el lead ya convertido', async () => {
        await page.goto('/dashboard')
        await page.getByTestId('tab-converted').click()
        await page.getByTestId('lead-search').fill(TELEFONO)
        await expect(filaDeLead(page, TELEFONO)).toBeVisible()
      })

      await cuando('reenvía la invitación desde el menú de acciones', async () => {
        await abrirAccionesDeLead(page, TELEFONO, NOMBRE)
        await page.getByRole('button', { name: 'Reenviar invitación' }).click()
        await expect(page.getByRole('heading', { name: 'Reenviar invitación' })).toBeVisible()
        await page.getByRole('button', { name: 'Reenviar', exact: true }).click()
      })

      await entonces('se muestra el link nuevo con opción de copiar', async () => {
        const inputLink = page.locator('input[value*="/onboarding/"]')
        await expect(inputLink).toBeVisible()
        await expect(page.getByRole('button', { name: 'Copiar' })).toBeVisible()
      })
    },
  )
})
