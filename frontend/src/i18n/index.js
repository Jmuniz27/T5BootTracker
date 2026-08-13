import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es.json'
import en from './locales/en.json'

// Idioma por defecto: español. La elección manual del usuario se guarda en
// localStorage y se respeta en la próxima carga. No hay autodetección del
// navegador: el default siempre es 'es'.
const STORAGE_KEY = 'lang'

function readSavedLang() {
  try {
    const saved = window?.localStorage?.getItem(STORAGE_KEY)
    return saved === 'en' || saved === 'es' ? saved : null
  } catch {
    return null
  }
}

const initialLang = readSavedLang() || 'es'

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang) {
  i18n.changeLanguage(lang)
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // localStorage puede fallar en modo privado; el idioma igual cambia en memoria.
  }
}

export default i18n
