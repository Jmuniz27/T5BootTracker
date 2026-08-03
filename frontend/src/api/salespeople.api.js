import client from './client'

// Actividad comercial por vendedor, para el panel del administrador.
// Sólo lectura: el backend no expone escritura en esta ruta.

export const getSalespeopleActivity = () =>
  client.get('/users/salespeople/').then((r) => r.data)

export const getSalespersonActivity = (salespersonId) =>
  client.get(`/users/salespeople/${salespersonId}/activity/`).then((r) => r.data)
