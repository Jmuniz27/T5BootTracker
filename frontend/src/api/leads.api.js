import client from './client'

export const getLeads = (params = {}) =>
  client.get('/leads/', { params }).then((r) => r.data)

export const convertLead = (id, data) =>
  client.post(`/leads/${id}/convert/`, data).then((r) => r.data)

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

export const getSelfAssignmentSetting = () =>
  client.get('/leads/settings/self-assignment/').then((r) => r.data)

export const updateSelfAssignmentSetting = (enabled) =>
  client
    .patch('/leads/settings/self-assignment/', { self_assign_enabled: enabled })
    .then((r) => r.data)
