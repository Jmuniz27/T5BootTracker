import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { USERS } from '../tests/support/users.js'
import { test } from './fixtures/anonimo.js'

// Único feature que arranca sin sesión: el login se ejercita por la
// interfaz, que es lo que exige la HST-001. Reutiliza texto y aserciones de
// tests/hst-001-login.spec.js (la versión Playwright pura del mismo escenario).
const { Given, When, Then } = createBdd(test)

Given('que el vendedor está en la pantalla de inicio de sesión', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByTestId('login-submit')).toBeVisible()
})

When('ingresa su email y contraseña correctos', async ({ page }) => {
  await page.getByTestId('login-email').fill(USERS.vendedor.email)
  await page.getByTestId('login-password').fill(USERS.vendedor.password)
  await page.getByTestId('login-submit').click()
})

Then('accede al panel y ve su sesión iniciada', async ({ page }) => {
  await expect(page).toHaveURL(/\/dashboard/)
  // La sesión quedó persistida: sin esto, un redirect optimista pasaría igual.
  const sesion = await page.evaluate(() => window.localStorage.getItem('auth'))
  expect(sesion, 'el token debería quedar persistido en localStorage').toBeTruthy()
  expect(JSON.parse(sesion).state.accessToken).toBeTruthy()
})

When('ingresa una contraseña incorrecta', async ({ page }) => {
  await page.getByTestId('login-email').fill(USERS.vendedor.email)
  await page.getByTestId('login-password').fill('contrasena-incorrecta')
  await page.getByTestId('login-submit').click()
})

Then('el sistema rechaza el acceso y no inicia sesión', async ({ page }) => {
  await expect(page.getByText('Credenciales incorrectas')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
  const sesion = await page.evaluate(() => window.localStorage.getItem('auth'))
  const token = sesion ? JSON.parse(sesion).state?.accessToken : null
  expect(token, 'no debería existir token tras un login fallido').toBeFalsy()
})
