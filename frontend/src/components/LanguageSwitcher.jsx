import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n'

/**
 * Selector de idioma ES/EN. `variant="dark"` para fondos oscuros (login).
 */
export default function LanguageSwitcher({ variant = 'light', className = '' }) {
  const { i18n } = useTranslation()
  const current = i18n.resolvedLanguage || i18n.language

  const isDark = variant === 'dark'
  const base = 'text-xs font-semibold px-2 py-1 rounded-md transition-colors'
  const active = isDark ? 'bg-white/20 text-white' : 'bg-[#213A8E] text-white'
  const idle = isDark ? 'text-white/60 hover:text-white' : 'text-gray-500 hover:text-gray-800'

  return (
    <div className={`inline-flex items-center gap-1 ${className}`} role="group" aria-label="Idioma / Language">
      {['es', 'en'].map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => setLanguage(lng)}
          aria-pressed={current === lng}
          className={`${base} ${current === lng ? active : idle}`}
        >
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
