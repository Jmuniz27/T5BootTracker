/** Espejo de `CustomUser.Role` en backend/apps/authentication/models.py */
export const ROLE_OPTIONS = [
  { value: 'ADMINISTRATOR', label: 'Administrador' },
  { value: 'COORDINATOR', label: 'Coordinador' },
  { value: 'SALESPERSON', label: 'Vendedor' },
  { value: 'FINANCE', label: 'Finanzas' },
  { value: 'BOOTCAMPER', label: 'Bootcamper' },
]

export const ROLE_LABELS = Object.fromEntries(
  ROLE_OPTIONS.map(({ value, label }) => [value, label]),
)

/**
 * Espejo de `CustomUser.CoordinatorScope`. Sólo aplica al rol COORDINATOR:
 * decide a qué programas se le notifica por correo.
 */
export const COORDINATOR_SCOPE_OPTIONS = [
  { value: 'GENERAL', label: 'General — todos los programas' },
  { value: 'PROGRAM', label: 'Por programa' },
]

export const COORDINATOR_SCOPE_LABELS = {
  GENERAL: 'General',
  PROGRAM: 'Por programa',
}

export const ROLE_BADGE_CLASSES = {
  ADMINISTRATOR: 'bg-indigo-50 text-indigo-700',
  COORDINATOR: 'bg-purple-50 text-purple-700',
  SALESPERSON: 'bg-blue-50 text-blue-700',
  FINANCE: 'bg-amber-50 text-amber-700',
  BOOTCAMPER: 'bg-gray-100 text-gray-600',
}
