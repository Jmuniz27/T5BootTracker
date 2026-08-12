// `test` con la sesión de bootcamper ya cargada (ver tests/support/users.js).
import { test as base } from 'playwright-bdd'
import { STORAGE_STATE } from '../../tests/support/users.js'

export const test = base.extend({
  storageState: STORAGE_STATE.bootcamper,
})
