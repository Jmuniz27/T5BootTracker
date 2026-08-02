import { test, expect } from '@playwright/test'
import { titulo, dado, y, cuando, entonces } from './support/gwt.js'
import { STORAGE_STATE, LEADS_DISPONIBLES } from './support/users.js'
import { filaDeLead, abrirAccionesDeLead } from './support/selectors.js'
import { clienteApi, buscarLeadPorTelefono, fijarAutoAsignacion, liberarLeadSiAsignado } from './support/api.js'

test.use({ storageState: STORAGE_STATE.vendedor })

// Lead del seed sin dueño (índices 5-9). Los 0-4 nacen asignados a vendedor1.
const TELEFONO = LEADS_DISPONIBLES[0]
const NOMBRE = 'Innovatech Cía.'

test.describe('HST-007 · Auto-asignación de leads', () => {
  // Precondiciones idempotentes: la suite debe poder correr dos veces seguidas
  // contra la misma base sin chocar con 409 LEAD_ALREADY_ASSIGNED.
  test.beforeAll(async () => {
    const apiAdmin = await clienteApi('admin')
    await fijarAutoAsignacion(apiAdmin, true)

    const lead = await buscarLeadPorTelefono(apiAdmin, TELEFONO)
    expect(lead, `el lead ${TELEFONO} debería existir; ¿corrió seed_dev?`).toBeTruthy()
    if (lead.owner) await liberarLeadSiAsignado(apiAdmin, lead.id)

    await apiAdmin.dispose()
  })

  test(
    titulo({
      hst: 'HST-007',
      dado: 'un lead disponible y la auto-asignación habilitada',
      cuando: 'el vendedor pulsa "Asignarme" sobre ese lead',
      entonces: 'el lead queda a su nombre y sale de la lista de disponibles',
    }),
    async ({ page }) => {
      await dado('que la auto-asignación está habilitada por el administrador', async () => {
        // Fijada en beforeAll vía API (CR-004: sólo el Administrador puede cambiarla).
        await page.goto('/dashboard')
        await expect(page.getByTestId('tab-available')).toBeVisible()
      })

      await y('el vendedor ve el lead en la pestaña de disponibles', async () => {
        await page.getByTestId('tab-available').click()
        await page.getByTestId('lead-search').fill(TELEFONO)
        await expect(filaDeLead(page, TELEFONO)).toBeVisible()
      })

      await cuando('pulsa "Asignarme" sobre ese lead', async () => {
        await abrirAccionesDeLead(page, TELEFONO, NOMBRE)
        await page.getByRole('button', { name: 'Asignarme' }).click()
      })

      await entonces('el lead queda a su nombre en "Mis leads"', async () => {
        await expect(page.getByText('Lead asignado correctamente.')).toBeVisible()

        await page.getByTestId('tab-mine').click()
        await page.getByTestId('lead-search').fill(TELEFONO)
        await expect(filaDeLead(page, TELEFONO)).toBeVisible()
      })

      await y('ya no aparece entre los disponibles', async () => {
        await page.getByTestId('tab-available').click()
        await page.getByTestId('lead-search').fill(TELEFONO)
        await expect(filaDeLead(page, TELEFONO)).toHaveCount(0)
      })
    },
  )
})
