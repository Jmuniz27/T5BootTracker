import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFinancePaymentPlan,
  getMyPaymentPlan,
  uploadFinancePaymentPlan,
  deleteFinancePaymentPlan,
  getPaymentPlanFileUrl,
} from '../../api/payments.api'

const ACCEPT = '.pdf,.xlsx,.xls'

function typeLabel(t) {
  return t === 'excel' ? 'Excel' : 'PDF'
}

/**
 * Plan de pagos de un bootcamper.
 *
 * `mode="finance"` (pasa `bootcamperId`): sube, reemplaza, elimina y ve el plan.
 * `mode="bootcamper"`: sólo lo ve (es su propio plan).
 */
export default function PaymentPlanPanel({ mode = 'finance', bootcamperId }) {
  const isFinance = mode === 'finance'
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [error, setError] = useState(null)

  const queryKey = isFinance ? ['payment-plan', bootcamperId] : ['my-payment-plan']

  const { data: plan, isLoading } = useQuery({
    queryKey,
    queryFn: () => (isFinance ? getFinancePaymentPlan(bootcamperId) : getMyPaymentPlan()),
    // Sin plan el backend devuelve 404: no es un error a mostrar, es "todavía no hay".
    retry: false,
    throwOnError: false,
  })

  const uploadMutation = useMutation({
    mutationFn: (formData) => uploadFinancePaymentPlan(bootcamperId, formData),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey }) },
    onError: (err) => setError(err?.response?.data?.error || 'No se pudo subir el archivo.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteFinancePaymentPlan(bootcamperId),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const onPick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    uploadMutation.mutate(fd)
    e.target.value = ''
  }

  const openFile = async () => {
    if (!plan?.id) return
    try {
      const url = await getPaymentPlanFileUrl(plan.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('No se pudo abrir el archivo.')
    }
  }

  const has = plan && plan.id

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Plan de pagos</h3>
        {has && (
          <span className="text-xs font-medium text-gray-500">{typeLabel(plan.file_type)}</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : has ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <svg className="w-4 h-4 text-[#213A8E]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            <span className="truncate">{plan.original_name || `plan.${plan.file_type === 'excel' ? 'xlsx' : 'pdf'}`}</span>
          </div>
          {plan.uploaded_by_name && (
            <p className="text-xs text-gray-500">Subido por {plan.uploaded_by_name}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openFile}
              className="text-xs font-medium text-[#213A8E] border border-[#213A8E]/40 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Ver plan
            </button>
            {isFinance && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  className="text-xs font-medium text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
                >
                  {uploadMutation.isPending ? 'Subiendo…' : 'Reemplazar'}
                </button>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="text-xs font-medium text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-60 transition-colors"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        </div>
      ) : isFinance ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Este bootcamper todavía no tiene un plan de pagos.</p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="text-xs font-medium text-white bg-[#213A8E] px-3 py-1.5 rounded-lg hover:bg-[#1a2f72] disabled:opacity-60 transition-colors"
          >
            {uploadMutation.isPending ? 'Subiendo…' : 'Subir plan (PDF o Excel)'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Aún no hay un plan de pagos cargado.</p>
      )}

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {isFinance && (
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={onPick} className="hidden" />
      )}
    </div>
  )
}
