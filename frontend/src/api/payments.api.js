import client from './client'

export const getMyHistory = () =>
  client.get('/payments/my-history/').then((r) => r.data)

export const getMyStatus = (programId) =>
  client.get('/payments/my-status/', { params: { program_id: programId } }).then((r) => r.data)

export const getOCRStatus = (id) =>
  client.get(`/payments/my-payments/${id}/ocr-status/`).then((r) => r.data)

export const uploadPayment = (formData) =>
  client
    .post('/payments/upload/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data)

export const confirmPayment = (id, data = {}) =>
  client.patch(`/payments/my-payments/${id}/confirm/`, data).then((r) => r.data)

export const getPaymentQueue = (params = {}) =>
  client.get('/payments/queue/', { params }).then((r) => r.data)

export const getPayment = (id) =>
  client.get(`/payments/${id}/`).then((r) => r.data)

export const approvePayment = (id, data) =>
  client.patch(`/payments/${id}/approve/`, data).then((r) => r.data)

export const rejectPayment = (id, data) =>
  client.patch(`/payments/${id}/reject/`, data).then((r) => r.data)

export const getPrograms = () =>
  client.get('/programs/').then((r) => r.data)

export const notifyCoordinator = (bootcamperId, programId) =>
  client
    .post(`/payments/notify-coordinator/${bootcamperId}/`, null, {
      params: { program_id: programId },
    })
    .then((r) => r.data)
