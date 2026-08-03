import client from './client'

// Actividad comercial por vendedor, para el panel del administrador.
// Sólo lectura: el backend no expone escritura en esta ruta.

export const getSalespeopleActivity = () =>
  client.get('/users/salespeople/').then((r) => r.data)
