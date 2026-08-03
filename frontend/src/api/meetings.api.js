import client from './client'

// API de reuniones (CB-54 / meetings): agenda server-side con sync a Google
// Calendar e invitación al lead.
export const getMeetings = (params = {}) =>
  client.get('/meetings/events/', { params }).then((r) => r.data)

export const createMeeting = (data) =>
  client.post('/meetings/events/', data).then((r) => r.data)

export const updateMeeting = (id, data) =>
  client.patch(`/meetings/events/${id}/`, data).then((r) => r.data)

export const deleteMeeting = (id) =>
  client.delete(`/meetings/events/${id}/`).then((r) => r.data)
