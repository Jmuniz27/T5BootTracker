import { test as setup, request, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { USERS, STORAGE_STATE } from './support/users.js'

const API_URL = process.env.E2E_API_URL || 'http://localhost:8000'
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173'

/**
 * Genera el storageState de cada rol autenticándose por API.
 *
 * Por API y no por la interfaz a propósito: si el login se rompe queremos que
 * falle el escenario HST-001 —que sí pasa por la pantalla— y no los otros
 * cuatro por arrastre. Además ahorra ~3 s por escenario.
 *
 * Los tokens se regeneran en cada corrida (son de vida corta) y `.auth/` está
 * en .gitignore: nunca se versionan.
 */
for (const [rol, credenciales] of Object.entries(USERS)) {
  setup(`autenticar ${rol}`, async () => {
    const contexto = await request.newContext({ baseURL: API_URL })
    const respuesta = await contexto.post('/api/auth/login/', { data: credenciales })

    expect(
      respuesta.ok(),
      `Login de ${rol} (${credenciales.email}) falló con ${respuesta.status()}. ` +
        '¿Corrió `manage.py seed_dev`?',
    ).toBeTruthy()

    const { access, refresh, user } = await respuesta.json()
    await contexto.dispose()

    // Forma exacta que persiste el store de Zustand (frontend/src/store/auth.store.js,
    // `persist` con name: 'auth'). El store no declara `version`, así que
    // tampoco se escribe aquí: un campo de más haría que persist descarte el estado.
    const estado = {
      cookies: [],
      origins: [
        {
          origin: BASE_URL,
          localStorage: [
            {
              name: 'auth',
              value: JSON.stringify({ state: { accessToken: access, refreshToken: refresh, user } }),
            },
          ],
        },
      ],
    }

    const destino = STORAGE_STATE[rol]
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, JSON.stringify(estado, null, 2))
  })
}
