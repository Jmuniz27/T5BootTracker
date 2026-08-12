import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import es from './locales/es.json';
import en from './locales/en.json';

const STORAGE_KEY = 'lang';

// Idioma por defecto: español. La elección del usuario se guarda en
// expo-secure-store y se aplica al arrancar (async). No hay autodetección.
i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

SecureStore.getItemAsync(STORAGE_KEY)
  .then((saved) => {
    if (saved === 'en' || saved === 'es') i18n.changeLanguage(saved);
  })
  .catch(() => {});

export async function setLanguage(lang: 'es' | 'en') {
  await i18n.changeLanguage(lang);
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, lang);
  } catch {
    // SecureStore puede fallar; el idioma igual cambió en memoria.
  }
}

export default i18n;
