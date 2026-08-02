import { request } from '@playwright/test'
import { USERS } from './users.js'

const API_URL = process.env.E2E_API_URL || 'http://localhost:8000'

/**
 * Cliente API autenticado como `rol`.
 *
 * Se usa para *preparar precondiciones* y para verificar estado del backend,
 * nunca para reemplazar lo que el escenario debe ejercitar por la interfaz:
 * un test de aceptación tiene que pasar por donde pasa la persona usuaria.
 */
export async function clienteApi(rol) {
  const credenciales = USERS[rol]
  if (!credenciales) throw new Error(`Rol desconocido: ${rol}`)

  const anonimo = await request.newContext({ baseURL: API_URL })
  const respuesta = await anonimo.post('/api/auth/login/', { data: credenciales })
  if (!respuesta.ok()) {
    throw new Error(`Login de ${rol} falló: ${respuesta.status()} ${await respuesta.text()}`)
  }
  const { access } = await respuesta.json()
  await anonimo.dispose()

  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${access}` },
  })
}

/** Busca un lead por teléfono. Devuelve `undefined` si no existe. */
export async function buscarLeadPorTelefono(api, telefono) {
  const respuesta = await api.get(`/api/leads/?search=${telefono}`)
  if (!respuesta.ok()) {
    throw new Error(`No se pudo listar leads: ${respuesta.status()} ${await respuesta.text()}`)
  }
  const cuerpo = await respuesta.json()
  const leads = cuerpo.results ?? cuerpo
  return leads.find((l) => l.phone === telefono)
}

/**
 * Deja la auto-asignación en el estado pedido (CR-004, sólo Administrador).
 *
 * Es precondición del escenario HST-007: por defecto viene habilitada, pero
 * otro escenario podría haberla cambiado y el orden no debe importar.
 */
export async function fijarAutoAsignacion(apiAdmin, habilitada) {
  const respuesta = await apiAdmin.patch('/api/leads/settings/self-assignment/', {
    data: { self_assign_enabled: habilitada },
  })
  if (!respuesta.ok()) {
    throw new Error(
      `No se pudo fijar la auto-asignación: ${respuesta.status()} ${await respuesta.text()}`,
    )
  }
}

/**
 * Libera un lead si quedó asignado, para que el escenario de auto-asignación
 * pueda volver a tomarlo. Sin esto, una segunda corrida contra la misma base
 * choca con 409 LEAD_ALREADY_ASSIGNED.
 */
export async function liberarLeadSiAsignado(apiAdmin, leadId) {
  const respuesta = await apiAdmin.post(`/api/leads/${leadId}/release/`, { data: {} })
  // 400/409 significa que ya estaba libre: es el estado que queríamos.
  if (!respuesta.ok() && ![400, 409].includes(respuesta.status())) {
    throw new Error(
      `No se pudo liberar el lead ${leadId}: ${respuesta.status()} ${await respuesta.text()}`,
    )
  }
}

/** Fija el estado de un lead (precondición de la conversión: debe ser QUALIFIED). */
export async function fijarEstadoDeLead(api, leadId, estado) {
  const respuesta = await api.patch(`/api/leads/${leadId}/`, { data: { status: estado } })
  if (!respuesta.ok()) {
    throw new Error(
      `No se pudo fijar el estado del lead ${leadId}: ${respuesta.status()} ${await respuesta.text()}`,
    )
  }
}
