import client from './client'

export const getUsers = () =>
  client.get('/users/', { params: { page_size: 100 } }).then((r) => r.data)
