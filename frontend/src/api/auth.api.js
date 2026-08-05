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

export const getOnboardingInfo = (token) =>
  api.get(`/auth/onboarding/${token}/`).then((r) => r.data);

export const activateOnboarding = (token, data) =>
  api.post(`/auth/onboarding/${token}/activate/`, data).then((r) => r.data);
