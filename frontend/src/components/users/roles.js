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

export const ROLE_BADGE_CLASSES = {
  ADMINISTRATOR: 'bg-indigo-50 text-indigo-700',
  COORDINATOR: 'bg-purple-50 text-purple-700',
  SALESPERSON: 'bg-blue-50 text-blue-700',
  FINANCE: 'bg-amber-50 text-amber-700',
  BOOTCAMPER: 'bg-gray-100 text-gray-600',
}
