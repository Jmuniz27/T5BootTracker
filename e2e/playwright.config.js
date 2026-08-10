import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173'

export default defineConfig({
  testDir: './tests',

  // Los escenarios operan sobre los datos compartidos de `seed_dev` y mutan
  // estado (asignan, convierten, aprueban). En paralelo se pisan entre sí:
  // LeadAssignView devuelve 409 LEAD_ALREADY_ASSIGNED si otro worker se
  // adelanta. La suite completa tarda ~1 min en serie; no vale la pena.
  fullyParallel: false,
  workers: 1,

  // Sin reintentos: un retry re-ejecuta un escenario que ya mutó estado y
  // falla con 409/400 por una razón distinta a la original, enmascarando el
  // error real. En un artefacto evaluado preferimos fallos honestos.
  retries: 0,

  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'reports/junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    // Los runners de CI corren en UTC; la UI formatea con toLocaleString('es-EC').
    // Fijarlo evita que las aserciones sobre fechas cambien según el entorno.
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
  },

  projects: [
    { name: 'setup', testMatch: /global\.setup\.js/ },
    {
      name: 'chromium',
      // Sólo los .spec.js: `tests/support/` contiene helpers, no escenarios.
      testMatch: /.*\.spec\.js/,
      // `mobile/` corre en su propio proyecto, con otro dispositivo.
      testIgnore: /mobile\//,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      // Comprobaciones de responsive que necesitan un navegador de verdad:
      // desborde horizontal, qué se ve en cada breakpoint y dónde cae un menú
      // posicionado por JS. Nada de eso se puede medir en jsdom.
      //
      // Los escenarios de `mobile/` no mutan estado —sólo navegan y abren
      // ventanas—, así que conviven con la suite serial sin pisarla. Mantenerlo
      // así: la suite corre con `workers: 1` y sin reintentos justamente
      // porque los demás escenarios sí comparten los datos de `seed_dev`.
      name: 'mobile-chromium',
      testMatch: /mobile\/.*\.spec\.js/,
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
    },
  ],
})
