import { test, expect } from '@playwright/test'
import { titulo, dado, y, cuando, entonces } from './support/gwt.js'
import { STORAGE_STATE, telefonoUnico } from './support/users.js'
import { elegirOpcion, filaDeLead, abrirAccionesDeLead } from './support/selectors.js'

test.use({ storageState: STORAGE_STATE.vendedor })

test.describe('HST-032 / HST-009 · Creación manual de lead y registro de interacción', () => {
  test(
    titulo({
      hst: 'HST-032 / HST-009',
      dado: 'un vendedor en el dashboard de leads',
      cuando: 'crea un lead manualmente y registra una interacción sobre él',
      entonces: 'el lead aparece asignado a él con la interacción registrada',
    }),
    async ({ page }) => {
      // Teléfono único por corrida: el rango del seed y los leads de corridas
      // previas dispararían la validación de duplicados (CR-011).
      const telefono = telefonoUnico()
      const nombre = `Lead E2E ${telefono.slice(-6)}`

      await dado('que el vendedor está en el dashboard de leads', async () => {
        await page.goto('/dashboard')
        await expect(page.getByTestId('new-lead-button')).toBeVisible()
      })

      await cuando('crea un lead manualmente y se lo asigna', async () => {
        await page.getByTestId('new-lead-button').click()
        // El modal cierra al hacer click en el backdrop: confirmar que abrió
        // antes de escribir evita fallos confusos más abajo.
        await expect(page.getByRole('heading', { name: 'Nuevo lead' })).toBeVisible()

        await page.getByTestId('create-lead-name').fill(nombre)
        await page.getByTestId('create-lead-phone').fill(telefono)
        await page.getByTestId('create-lead-email').fill(`e2e-${telefono}@test.com`)
        await elegirOpcion(page, 'create-lead-source', 'Manual')

        // Registrar interacción exige que el lead sea propio.
        await page.getByTestId('create-lead-autoassign').check()
        await page.getByTestId('create-lead-submit').click()
      })

      await entonces('el lead aparece en su lista con los datos ingresados', async () => {
        await expect(page.getByText('Lead creado y asignado a ti.')).toBeVisible()
        await page.getByTestId('tab-mine').click()
        await page.getByTestId('lead-search').fill(telefono)
        await expect(filaDeLead(page, telefono)).toBeVisible()
        await expect(filaDeLead(page, telefono)).toContainText(nombre)
      })

      await y('al registrar una interacción, queda asociada al lead', async () => {
        await abrirAccionesDeLead(page, telefono, nombre)
        await page.getByRole('button', { name: 'Registrar interacción' }).click()
        await expect(page.getByRole('heading', { name: 'Registrar interacción' })).toBeVisible()

        await elegirOpcion(page, 'interaction-type', 'Llamada')
        await elegirOpcion(page, 'interaction-outcome', 'Llamar de nuevo')
        await page.getByTestId('interaction-notes').fill('Primer contacto desde la suite de aceptación.')
        await page.getByTestId('interaction-submit').click()

        await expect(page.getByText('Interacción registrada correctamente.')).toBeVisible()
      })
    },
  )
})
