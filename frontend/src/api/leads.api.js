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

export const getInteractions = (leadId) =>
  client.get(`/leads/${leadId}/interactions/`).then((r) => r.data)

export const createLead = (data) =>
  client.post('/leads/', data).then((r) => r.data)

export const createInteraction = (leadId, data) =>
  client.post(`/leads/${leadId}/interactions/`, data).then((r) => r.data)

export const updateLeadStatus = (id, data) =>
  client.patch(`/leads/${id}/`, data).then((r) => r.data)
