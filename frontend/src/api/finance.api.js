import client from './client'

// Cartera de bootcampers por persona de Finanzas, para el panel del
// administrador. Sólo lectura: el backend no expone escritura en estas rutas —
// reasignar un bootcamper es cosa de Finanzas, que lo libera al pool.

export const getFinancePortfolio = () =>
  client.get('/users/finance/').then((r) => r.data)

export const getFinanceBootcampers = (financeId) =>
  client.get(`/users/finance/${financeId}/bootcampers/`).then((r) => r.data)
