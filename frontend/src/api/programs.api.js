import client from './client'

// Programas y sus cohortes. Las cohortes viven anidadas bajo el programa, igual
// que en el backend: no existe una cohorte sin programa.

export const getPrograms = () =>
  client.get('/programs/').then((r) => r.data)

export const createProgram = (data) =>
  client.post('/programs/', data).then((r) => r.data)

export const getCohorts = (programId, params = {}) =>
  client.get(`/programs/${programId}/cohorts/`, { params }).then((r) => r.data)

export const createCohort = (programId, data) =>
  client.post(`/programs/${programId}/cohorts/`, data).then((r) => r.data)

export const updateCohort = (programId, cohortId, data) =>
  client.patch(`/programs/${programId}/cohorts/${cohortId}/`, data).then((r) => r.data)

export const deleteCohort = (programId, cohortId) =>
  client.delete(`/programs/${programId}/cohorts/${cohortId}/`).then((r) => r.data)
