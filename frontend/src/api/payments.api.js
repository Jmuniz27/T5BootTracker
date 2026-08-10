import client from './client'

export const getMyHistory = () =>
  client.get('/payments/my-history/').then((r) => r.data)

export const getMyPrograms = () =>
  client.get('/payments/my-programs/').then((r) => r.data)

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

// `source` dice desde qué pantalla se pidió el aviso, para que el correo al
// coordinador diga de qué se trata en vez de ser siempre el mismo texto.
export const notifyCoordinator = (bootcamperId, programId, { source, paymentId } = {}) =>
  client
    .post(
      `/payments/notify-coordinator/${bootcamperId}/`,
      {
        ...(source ? { source } : {}),
        ...(paymentId ? { payment_id: paymentId } : {}),
      },
      { params: { program_id: programId } },
    )
    .then((r) => r.data)

export const getMonitoring = (params = {}) =>
  client.get('/payments/monitoring/', { params }).then((r) => r.data)

// Historial completo de solicitudes de un bootcamper: incluye las ya revisadas.
// `getPaymentQueue` sólo devuelve pendientes, así que tras aprobar o rechazar la
// solicitud desaparecía y con ella el motivo y quién la validó.
export const getPaymentHistory = (params = {}) =>
  client.get('/payments/history/', { params }).then((r) => r.data)

// Control global de auto-asignación del pool (espejo del de leads, CR-004).
// Lo lee Finanzas para saber si su botón está habilitado; sólo el admin lo cambia.
export const getBootcamperAssignmentSetting = () =>
  client.get('/payments/settings/self-assignment/').then((r) => r.data)

export const updateBootcamperAssignmentSetting = (enabled) =>
  client
    .patch('/payments/settings/self-assignment/', { self_assign_enabled: enabled })
    .then((r) => r.data)

// ── Pool de bootcampers ───────────────────────────────────────────────────────
// Misma mecánica que el pool de leads: al convertirse, un bootcamper queda sin
// responsable de cobro y quien es de Finanzas se lo asigna para monitorearlo.

export const getBootcamperPool = (params = {}) =>
  client.get('/payments/bootcampers/', { params }).then((r) => r.data)

// `financeOwnerId` sólo lo manda el administrador, que reparte el pool: Finanzas
// se lo asigna a sí misma y el backend ignora el cuerpo.
export const assignBootcamper = (bootcamperId, financeOwnerId = null) =>
  client
    .patch(
      `/payments/bootcampers/${bootcamperId}/assign/`,
      financeOwnerId ? { finance_owner_id: financeOwnerId } : {},
    )
    .then((r) => r.data)

// #326 — reparto en lote. Los que fallan vienen en `failed` con su motivo; el
// resto sí queda asignado, así que la respuesta hay que leerla, no asumirla.
export const bulkAssignBootcampers = (bootcamperIds, financeOwnerId = null) =>
  client
    .patch('/payments/bootcampers/bulk-assign/', {
      bootcamper_ids: bootcamperIds,
      ...(financeOwnerId ? { finance_owner_id: financeOwnerId } : {}),
    })
    .then((r) => r.data)

export const releaseBootcamper = (bootcamperId) =>
  client.patch(`/payments/bootcampers/${bootcamperId}/release/`).then((r) => r.data)

// ── Editar / eliminar pagos propios (CB-117 T6) ───────────────────────────────
//   PATCH  /payments/my-payments/<id>/  → el bootcamper corrige un pago REJECTED
//                                          y lo reenvía (backend: REJECTED → PENDING).
//   DELETE /payments/my-payments/<id>/  → el bootcamper elimina un pago propio en
//                                          estado DRAFT (en revisión) o REJECTED.
// `data` puede ser FormData (para adjuntar un comprobante nuevo) o un objeto
// plano (solo corrige campos). Axios pone el Content-Type correcto en cada caso.
export const updateMyPayment = (id, data) =>
  client.patch(`/payments/my-payments/${id}/`, data).then((r) => r.data)

export const deleteMyPayment = (id) =>
  client.delete(`/payments/my-payments/${id}/`).then((r) => r.data)

// ── Finanzas edita un pago pendiente (fecha, cuenta/banco y demás datos) ───────
export const editPayment = (id, data) =>
  client.patch(`/payments/${id}/edit/`, data).then((r) => r.data)

// ── Plan de pagos (lo sube Finanzas por bootcamper; el bootcamper solo lo ve) ──
export const getFinancePaymentPlan = (bootcamperId) =>
  client.get(`/payments/bootcampers/${bootcamperId}/payment-plan/`).then((r) => r.data)

export const uploadFinancePaymentPlan = (bootcamperId, formData) =>
  client
    .put(`/payments/bootcampers/${bootcamperId}/payment-plan/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)

export const deleteFinancePaymentPlan = (bootcamperId) =>
  client.delete(`/payments/bootcampers/${bootcamperId}/payment-plan/`).then((r) => r.data)

export const getMyPaymentPlan = () =>
  client.get('/payments/my-payment-plan/').then((r) => r.data)

// El archivo del plan exige auth (JWT), así que no se puede abrir por <a href>:
// se baja como blob con el cliente y se genera un object URL para verlo.
export const getPaymentPlanFileUrl = (planId) =>
  client
    .get(`/payments/payment-plans/${planId}/file/`, { responseType: 'blob' })
    .then((r) => URL.createObjectURL(r.data))
