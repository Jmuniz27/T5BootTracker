import client from './client'

// Actividad comercial por vendedor, para el panel del administrador.
// Sólo lectura: el backend no expone escritura en esta ruta.

// `params` acepta fecha_desde / fecha_hasta (YYYY-MM-DD), que el backend acota
// por fecha de asignación del lead.
export const getSalespeopleActivity = (params = {}) =>
  client.get('/users/salespeople/', { params }).then((r) => r.data)

export const getSalespersonActivity = (salespersonId) =>
  client.get(`/users/salespeople/${salespersonId}/activity/`).then((r) => r.data)
