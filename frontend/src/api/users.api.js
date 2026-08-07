import client from './client'

export const getUsers = (params = {}) =>
  client.get('/users/', { params: { page_size: 100, ...params } }).then((r) => r.data)

export const createUser = (data) =>
  client.post('/users/', data).then((r) => r.data)

export const updateUser = (id, data) =>
  client.patch(`/users/${id}/`, data).then((r) => r.data)

export const toggleUserActive = (id) =>
  client.post(`/users/${id}/toggle-active/`).then((r) => r.data)

export const resetUserPassword = (id) =>
  client.post(`/users/${id}/reset-password/`).then((r) => r.data)

// CB-347: asignar/cambiar la cohorte de una inscripción de un bootcamper.
// cohortId puede ser null para vaciarla.
export const updateEnrollmentCohort = (bootcamperId, enrollmentId, cohortId) =>
  client
    .patch(`/users/${bootcamperId}/enrollments/${enrollmentId}/`, { cohort_id: cohortId })
    .then((r) => r.data)
