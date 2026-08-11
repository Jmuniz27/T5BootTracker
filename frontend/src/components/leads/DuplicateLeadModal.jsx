import { useTranslation } from 'react-i18next'
import { useModalA11y } from '../../hooks/use-modal-a11y'

function Row({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 w-20 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium break-all">{value}</span>
    </div>
  )
}

/**
 * Arma el texto de coincidencia según qué campo(s) realmente matcheó el
 * backend. `find_duplicate_lead` (services.py) hace una sola consulta
 * `phone=X OR email=Y` y no distingue cuál matcheó, así que la distinción se
 * hace acá: comparamos lo que el usuario tipeó (`payload`) contra el lead que
 * volvió (`duplicate`).
 */
function matchDescription(duplicate, payload, t) {
  const phoneMatches = Boolean(payload?.phone && duplicate?.phone === payload.phone)
  const emailMatches = Boolean(payload?.email && duplicate?.email === payload.email)

  if (phoneMatches && emailMatches) return t('leads.duplicate.matchBoth')
  if (phoneMatches) return t('leads.duplicate.matchPhone')
  if (emailMatches) return t('leads.duplicate.matchEmail')
  // Fallback: no deberíamos llegar acá si el backend efectivamente encontró un
  // duplicado, pero por las dudas no dejamos el mensaje en blanco.
  return t('leads.duplicate.matchAny')
}

/**
 * Advertencia de posible duplicado (CR-011). El backend responde 409 con el
 * lead que coincide por teléfono o email; acá se muestra para que el usuario
 * decida, y al confirmar se reenvía la creación con confirm_duplicate.
 */
export default function DuplicateLeadModal({ duplicate, payload, isLoading, onConfirm, onClose }) {
  const { t } = useTranslation()
  const dialogRef = useModalA11y(onClose)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('leads.duplicate.title')}
        className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-[460px] shadow-xl focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 text-amber-600 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('leads.duplicate.title')}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {t('leads.duplicate.existsWith', { match: matchDescription(duplicate, payload, t) })}
            </p>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1.5 mb-5">
          <Row label={t('leads.duplicate.name')} value={duplicate?.name} />
          <Row label={t('leads.duplicate.phone')} value={duplicate?.phone} />
          <Row label={t('leads.duplicate.email')} value={duplicate?.email} />
        </div>

        <p className="text-sm text-gray-600 mb-5">
          {t('leads.duplicate.explanation')}
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            {t('leads.common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2.5 bg-[#213A8E] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
          >
            {isLoading ? t('leads.form.creating') : t('leads.duplicate.createAnyway')}
          </button>
        </div>
      </div>
    </div>
  )
}
