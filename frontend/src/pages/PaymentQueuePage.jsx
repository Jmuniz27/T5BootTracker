import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getPaymentQueue, getPrograms } from '../api/payments.api'
import PaymentDetailModal from '../components/PaymentDetailModal'
import Toast from '../components/Toast'
import CustomSelect from '../components/CustomSelect'

const STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600',
  DRAFT: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  DRAFT: 'En revisión',
}

// ─── Queue Row ────────────────────────────────────────────────────────────────

function QueueRow({ payment, onClick }) {
  const date = payment.ocr_payment_date || payment.submitted_at?.slice(0, 10)
  const amount = payment.ocr_amount

  return (
    <tr
      onClick={onClick}
      className="hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <td className="py-3.5 px-4">
        <p className="text-sm font-medium text-gray-900">{payment.bootcamper_name}</p>
        <p className="text-xs text-gray-400">{payment.bootcamper}</p>
      </td>
      <td className="py-3.5 px-4 text-sm text-gray-700">{payment.program_name}</td>
      <td className="py-3.5 px-4 text-sm text-gray-700">
        {amount ? `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
      </td>
      <td className="py-3.5 px-4 text-sm text-gray-500">{date || '—'}</td>
      <td className="py-3.5 px-4">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[payment.status]}`}>
          {STATUS_LABELS[payment.status]}
        </span>
      </td>
      <td className="py-3.5 px-4">
        <button className="p-1.5 bg-[#1D3176] hover:bg-[#162560] text-white rounded-lg transition-colors" title="Ver detalle">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </td>
    </tr>
  )
}

function SkeletonQueueRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(6)].map((_, i) => (
        <td key={i} className="py-3.5 px-4">
          <div className="h-3.5 bg-gray-200 rounded w-24" />
        </td>
      ))}
    </tr>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaymentQueuePage() {
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [search, setSearch] = useState('')
  const [programId, setProgramId] = useState('')
  const [toast, setToast] = useState(null)

  const { data: queue = [], isLoading, isFetching } = useQuery({
    queryKey: ['payment-queue', { search, programId }],
    queryFn: () => getPaymentQueue({ search: search || undefined, program_id: programId || undefined }),
    placeholderData: keepPreviousData,
  })

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
  })

  const showToast = (message, type = 'success') => setToast({ message, type })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cola de pagos</h1>
      </div>

      {/* Table card — mirrors dashboard layout */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Comprobantes pendientes</h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-5 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar bootcamper..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-transparent bg-white"
            />
          </div>
          <CustomSelect
            value={programId}
            onChange={setProgramId}
            options={[
              { value: '', label: 'Todos los programas' },
              ...programs.map((p) => ({ value: p.id, label: p.name })),
            ]}
            placeholder="Todos los programas"
          />
          {isFetching && !isLoading && (
            <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Bootcamper</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Programa</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => <SkeletonQueueRow key={i} />)
              ) : queue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-sm text-gray-500">No hay pagos pendientes de revisión.</p>
                  </td>
                </tr>
              ) : (
                queue.map((p) => (
                  <QueueRow key={p.id} payment={p} onClick={() => setSelectedPayment(p)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPayment && (
        <PaymentDetailModal
          paymentId={selectedPayment.id}
          bootcamperId={selectedPayment.bootcamper}
          onClose={() => setSelectedPayment(null)}
          onSuccess={(msg) => {
            setSelectedPayment(null)
            showToast(msg)
          }}
        />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
