import { useState } from 'react'
import Skeleton from '../ui/Skeleton'

/**
 * Historial de solicitudes de pago de un bootcamper.
 *
 * Complementa la cola de pendientes: una vez aprobada o rechazada, la solicitud
 * salía de la pantalla y con ella el motivo del rechazo y quién la validó. Acá
 * quedan todas, de la más reciente a la más antigua.
 *
 * Sólo lectura. Aprobar y rechazar siguen en el modal de la solicitud pendiente.
 */

const STATUS_STYLE = {
  APPROVED: { label: 'Aprobado',   badge: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Rechazado',  badge: 'bg-red-100 text-red-600' },
  PENDING:  { label: 'Pendiente',  badge: 'bg-amber-100 text-amber-700' },
  DRAFT:    { label: 'En revisión', badge: 'bg-gray-100 text-gray-600' },
}

/** Cuántas se ven antes de tener que desplegar el resto. */
const VISIBLE_BY_DEFAULT = 5

function fmtMoney(value) {
  const n = parseFloat(value)
  if (Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(value) {
  if (!value) return '—'
  // Fecha y hora locales: dos solicitudes del mismo día se distinguen.
  return new Date(value).toLocaleString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function HistoryRow({ item, onViewDetail }) {
  const style = STATUS_STYLE[item.status] ?? STATUS_STYLE.DRAFT
  // El monto confirmado sólo existe tras aprobar; antes se muestra el del OCR.
  const amount = item.confirmed_amount ?? item.ocr_amount

  return (
    <li className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>
              {style.label}
            </span>
            <span className="text-sm font-semibold text-gray-900">{fmtMoney(amount)}</span>
            {item.confirmed_amount == null && item.ocr_amount != null && (
              <span className="text-xs text-gray-400">(según el comprobante)</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Enviado {fmtDate(item.submitted_at)}</p>
          {item.validated_by_name && (
            <p className="text-xs text-gray-500 mt-0.5">
              Revisado por {item.validated_by_name} · {fmtDate(item.validated_at)}
            </p>
          )}
        </div>
        <button
          onClick={() => onViewDetail(item)}
          className="text-xs font-medium text-[#1D3176] hover:underline flex-shrink-0"
        >
          Ver
        </button>
      </div>
      {/* El motivo del rechazo no se muestra acá: la lista resume y el detalle
          explica. Se lee en la pestaña "Motivo del rechazo" al abrir "Ver". */}
    </li>
  )
}

export default function PaymentHistory({ items = [], isLoading, onViewDetail }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, VISIBLE_BY_DEFAULT)
  const hidden = items.length - visible.length

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-gray-900 mb-4">
        Historial de solicitudes
        {items.length > 0 && (
          <span className="ml-2 text-xs font-medium text-gray-400">{items.length}</span>
        )}
      </h2>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" rounded="rounded-xl" />)}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl py-10 text-center">
          <p className="text-sm text-gray-500">Todavía no hay solicitudes de pago.</p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <>
          <ul className="space-y-2">
            {visible.map((item) => (
              <HistoryRow key={item.id} item={item} onViewDetail={onViewDetail} />
            ))}
          </ul>
          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-3 text-sm font-medium text-[#1D3176] hover:underline"
            >
              Ver {hidden} solicitud{hidden === 1 ? '' : 'es'} más
            </button>
          )}
        </>
      )}
    </section>
  )
}
