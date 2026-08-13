// `test` con la sesión de vendedor ya cargada (mismo storageState que usan
// los specs Playwright puros en tests/*.spec.js, ver tests/support/users.js).
import { test as base } from 'playwright-bdd'
import { STORAGE_STATE } from '../../tests/support/users.js'

export const test = base.extend({
  storageState: STORAGE_STATE.vendedor,
})
