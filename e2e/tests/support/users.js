/**
 * Credenciales creadas por `manage.py seed_dev`
 * (backend/apps/authentication/management/commands/seed_dev.py).
 *
 * Son datos de desarrollo: la rotación antes del handover está en T3.4 del
 * plan de entrega. Nunca usar estas credenciales fuera de local/CI.
 */
export const USERS = {
  admin: { email: 'admin@boottracker.com', password: 'admin1234' },
  vendedor: { email: 'vendedor1@boottracker.com', password: 'vendedor1234' },
  bootcamper: { email: 'bootcamper.conv@boottracker.com', password: 'boot1234' },
}

/** Roles → archivo de storageState que genera `global.setup.js`. */
export const STORAGE_STATE = {
  admin: '.auth/admin.json',
  vendedor: '.auth/vendedor.json',
  bootcamper: '.auth/bootcamper.json',
}

/**
 * Leads del seed. Los índices 0-4 (0991000001-05) nacen asignados a
 * vendedor1; los 5-9 (0991000006-10) quedan sin dueño y son los únicos
 * seguros para el escenario de auto-asignación.
 */
export const LEADS_DISPONIBLES = ['0991000006', '0991000007', '0991000008', '0991000009', '0991000010']
export const LEADS_DE_VENDEDOR1 = ['0991000001', '0991000002', '0991000003', '0991000004', '0991000005']

export const PROGRAMA_PRINCIPAL = 'Python Full Stack Abril 2026'

/**
 * Teléfono único por corrida: evita chocar con el rango del seed
 * (0991000001-10) y con leads creados por corridas anteriores cuando la
 * base no se recrea. La validación de duplicados (CR-011) rechazaría el alta.
 */
export function telefonoUnico() {
  const sufijo = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
  return `0997${sufijo}`
}
