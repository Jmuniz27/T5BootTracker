import client from './client'

export const getLeads = (params = {}) =>
  client.get('/leads/', { params }).then((r) => r.data)

// El backend topea page_size en 100 (MAX_PAGE_SIZE), así que un export completo
// tiene que recorrer las páginas. Se cortan a MAX_EXPORT_PAGES para que un
// dataset inesperadamente grande no cuelgue el navegador; el llamador avisa
// cuando se truncó.
const EXPORT_PAGE_SIZE = 100
const MAX_EXPORT_PAGES = 50

// El listado devuelve varias particiones en la misma respuesta y cada una
// pagina por su cuenta. Se exporta la que el usuario está viendo, no la unión:
// juntarlas duplicaría leads (un lead asignado está en `all` y en `assigned`).
const TOTAL_PAGES_KEY = {
  my_leads:         'my_leads_total_pages',
  available_leads:  'available_leads_total_pages',
  converted_leads:  'converted_leads_total_pages',
  all_leads:        'all_leads_total_pages',
  assigned_leads:   'assigned_leads_total_pages',
  unassigned_leads: 'unassigned_leads_total_pages',
}

/**
 * Trae todas las páginas de una partición del listado, para exportarla.
 *
 * @param bucket  clave de la partición (ver TOTAL_PAGES_KEY)
 * @param params  los mismos filtros que están aplicados en pantalla
 * @returns {{rows: object[], truncated: boolean}}
 */
export async function getAllLeads(bucket, params = {}) {
  if (!TOTAL_PAGES_KEY[bucket]) {
    throw new Error(`Partición de leads desconocida: ${bucket}`)
  }

  const rows = []
  let totalPages = 1
  let truncated = false

  for (let page = 1; page <= Math.min(totalPages, MAX_EXPORT_PAGES); page += 1) {
    // Secuencial a propósito: no se conoce totalPages hasta la primera
    // respuesta, y el backend tiene rate limiting.
    // eslint-disable-next-line no-await-in-loop
    const data = await getLeads({ ...params, page, page_size: EXPORT_PAGE_SIZE })
    rows.push(...(data[bucket] ?? []))

    totalPages = data.pagination?.[TOTAL_PAGES_KEY[bucket]] ?? 1
    if (totalPages > MAX_EXPORT_PAGES) truncated = true
  }

  return { rows, truncated }
}

export const convertLead = (id, data) =>
  client.post(`/leads/${id}/convert/`, data).then((r) => r.data)

export const resendInvitation = (id) =>
  client.post(`/leads/${id}/resend-invitation/`).then((r) => r.data)

export const verifyBootcamper = (id) =>
  client.patch(`/leads/${id}/verify-bootcamper/`).then((r) => r.data)

export const getPrograms = () =>
  client.get('/programs/').then((r) => r.data)

export const assignLead = (id) =>
  client.patch(`/leads/${id}/assign/`).then((r) => r.data)

export const releaseLead = (id) =>
  client.patch(`/leads/${id}/release/`).then((r) => r.data)

export const adminReassignLead = (id, ownerId) =>
  client.patch(`/leads/${id}/admin-reassign/`, { owner_id: ownerId ?? null }).then((r) => r.data)

export const getInteractions = (leadId) =>
  client.get(`/leads/${leadId}/interactions/`).then((r) => r.data)

export const createLead = (data) =>
  client.post('/leads/', data).then((r) => r.data)

export const createInteraction = (leadId, data) =>
  client.post(`/leads/${leadId}/interactions/`, data).then((r) => r.data)

export const updateInteraction = (leadId, interactionId, data) =>
  client.patch(`/leads/${leadId}/interactions/${interactionId}/`, data).then((r) => r.data)

export const updateLeadStatus = (id, data) =>
  client.patch(`/leads/${id}/`, data).then((r) => r.data)

// #324 — descartar exige motivo, por eso no va por el PATCH genérico: el
// backend rechaza status=DISCARDED por esa vía justamente para que no haya
// forma de cerrar un lead sin decir por qué.
export const discardLead = (id, data) =>
  client.patch(`/leads/${id}/discard/`, data).then((r) => r.data)

export const restoreLead = (id) =>
  client.patch(`/leads/${id}/restore/`).then((r) => r.data)

export const updateLead = (id, data) =>
  client.patch(`/leads/${id}/`, data).then((r) => r.data)

export const getSelfAssignmentSetting = () =>
  client.get('/leads/settings/self-assignment/').then((r) => r.data)

export const updateSelfAssignmentSetting = (enabled) =>
  client
    .patch('/leads/settings/self-assignment/', { self_assign_enabled: enabled })
    .then((r) => r.data)
