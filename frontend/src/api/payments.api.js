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

export const getMonitoring = (params = {}) =>
  client.get('/payments/monitoring/', { params }).then((r) => r.data)

// ── Editar / eliminar pagos propios (CB-117 T6) ───────────────────────────────
// Contrato ASUMIDO — pendiente de implementación en backend:
//   PATCH  /payments/my-payments/<id>/  → el bootcamper corrige un pago REJECTED
//                                          y lo reenvía (backend: REJECTED → PENDING).
//   DELETE /payments/my-payments/<id>/  → el bootcamper elimina un pago propio en
//                                          estado DRAFT (en revisión) o REJECTED.
// Ambos deben validar propiedad (payment.bootcamper == request.user).
export const updateMyPayment = (id, data) =>
  client.patch(`/payments/my-payments/${id}/`, data).then((r) => r.data)

export const deleteMyPayment = (id) =>
  client.delete(`/payments/my-payments/${id}/`).then((r) => r.data)
