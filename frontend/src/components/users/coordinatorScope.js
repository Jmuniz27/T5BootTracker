import { z } from 'zod'

/** Fragmento de esquema compartido por los modales de crear y editar usuario. */
export const coordinatorScopeFields = {
  coordinator_scope: z.string(),
  coordinator_programs: z.array(z.string()),
}

/**
 * Reglas cruzadas rol ↔ alcance. Espejo de `CoordinatorScopeMixin` en
 * backend/apps/users/serializers.py: el coordinador debe declarar alcance, y
 * el alcance por programa exige elegir al menos uno.
 */
export function refineCoordinatorScope(values, ctx) {
  if (values.role !== 'COORDINATOR') return

  if (!values.coordinator_scope) {
    ctx.addIssue({
      code: 'custom',
      path: ['coordinator_scope'],
      message: 'Indica si el coordinador es general o de un programa',
    })
    return
  }

  if (
    values.coordinator_scope === 'PROGRAM' &&
    (values.coordinator_programs ?? []).length === 0
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['coordinator_programs'],
      message: 'Selecciona al menos un programa que coordina',
    })
  }
}

/**
 * Normaliza el alcance para el API: sólo el coordinador lo lleva, y el general
 * nunca viaja con programas. Evita que quede basura al cambiar de rol.
 */
export function coordinatorScopePayload(values) {
  if (values.role !== 'COORDINATOR') {
    return { coordinator_scope: '', coordinator_programs: [] }
  }

  return {
    coordinator_scope: values.coordinator_scope,
    coordinator_programs:
      values.coordinator_scope === 'PROGRAM' ? (values.coordinator_programs ?? []) : [],
  }
}
