import { test, expect } from '@playwright/test'
import { titulo, dado, cuando, entonces } from './support/gwt.js'
import { USERS } from './support/users.js'

// Único archivo que arranca sin sesión: aquí el login se ejercita por la
// interfaz, que es lo que exige la HST-001.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('HST-001 · Inicio de sesión', () => {
  test(
    titulo({
      hst: 'HST-001',
      dado: 'un vendedor registrado en el sistema',
      cuando: 'ingresa su email y contraseña correctos',
      entonces: 'accede al panel y ve su sesión iniciada',
    }),
    async ({ page }) => {
      await dado('que el vendedor está en la pantalla de inicio de sesión', async () => {
        await page.goto('/login')
        await expect(page.getByTestId('login-submit')).toBeVisible()
      })

      await cuando('ingresa su email y contraseña correctos', async () => {
        await page.getByTestId('login-email').fill(USERS.vendedor.email)
        await page.getByTestId('login-password').fill(USERS.vendedor.password)
        await page.getByTestId('login-submit').click()
      })

      await entonces('accede al panel y ve su sesión iniciada', async () => {
        await expect(page).toHaveURL(/\/dashboard/)
        // La sesión quedó persistida: sin esto, un redirect optimista pasaría igual.
        const sesion = await page.evaluate(() => window.localStorage.getItem('auth'))
        expect(sesion, 'el token debería quedar persistido en localStorage').toBeTruthy()
        expect(JSON.parse(sesion).state.accessToken).toBeTruthy()
      })
    },
  )

  test(
    titulo({
      hst: 'HST-001',
      dado: 'un vendedor registrado',
      cuando: 'ingresa una contraseña incorrecta',
      entonces: 'el sistema rechaza el acceso y no inicia sesión',
    }),
    async ({ page }) => {
      await dado('que el vendedor está en la pantalla de inicio de sesión', async () => {
        await page.goto('/login')
      })

      await cuando('ingresa una contraseña incorrecta', async () => {
        await page.getByTestId('login-email').fill(USERS.vendedor.email)
        await page.getByTestId('login-password').fill('contrasena-incorrecta')
        await page.getByTestId('login-submit').click()
      })

      await entonces('el sistema rechaza el acceso y no inicia sesión', async () => {
        await expect(page.getByText('Credenciales incorrectas')).toBeVisible()
        await expect(page).toHaveURL(/\/login/)
        const sesion = await page.evaluate(() => window.localStorage.getItem('auth'))
        const token = sesion ? JSON.parse(sesion).state?.accessToken : null
        expect(token, 'no debería existir token tras un login fallido').toBeFalsy()
      })
    },
  )
})
