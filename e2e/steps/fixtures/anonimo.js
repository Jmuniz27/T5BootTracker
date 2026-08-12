// `test` sin sesión: único feature (HST-001 login) que ejercita la
// autenticación por la interfaz en vez de partir de un storageState.
// Debe llamarse "test" para que `bddgen` (playwright-bdd) pueda detectar
// automáticamente qué instancia de test usa el steps file que lo importa.
import { test as base } from 'playwright-bdd'

export const test = base.extend({
  storageState: { cookies: [], origins: [] },
})
