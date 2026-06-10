import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const loginUser = ({ email, password }) =>
  api.post('/auth/login/', { email, password }).then((r) => r.data);

export const requestPasswordReset = ({ email }) =>
  api.post('/auth/password-reset/', { email }).then((r) => r.data);

export const confirmPasswordReset = ({ token, password, password_confirm }) =>
  api
    .post('/auth/password-reset/confirm/', { token, password, password_confirm })
    .then((r) => r.data);
