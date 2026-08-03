import client from './client'

// Cartera de bootcampers por vendedor, para el panel del administrador.
// Sólo lectura: el backend no expone escritura en estas rutas.

export const getSalespeoplePortfolio = () =>
  client.get('/users/salespeople/').then((r) => r.data)

export const getSalespersonBootcampers = (salespersonId) =>
  client.get(`/users/salespeople/${salespersonId}/bootcampers/`).then((r) => r.data)
