import { useState } from 'react'
import { exportAnalyticsReport } from '../../api/analytics.api'

const FORMATS = [
  { key: 'xlsx', label: 'Excel' },
  { key: 'csv', label: 'CSV' },
]

/** Dispara la descarga en el navegador a partir del blob del backend. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Exporta el reporte de analítica (CB-58 / HST-026) con los filtros activos,
 * así el archivo coincide con lo que se ve en pantalla.
 */
export default function AnalyticsExportButtons({ filters = {} }) {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)

  const handleExport = async (format) => {
    setPending(format)
    setError(null)
    try {
      const { blob, filename } = await exportAnalyticsReport(format, filters)
      downloadBlob(blob, filename)
    } catch {
      setError('No pudimos generar el reporte. Intenta de nuevo.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {FORMATS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => handleExport(key)}
          disabled={pending !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {pending === key ? 'Generando…' : `Exportar ${label}`}
        </button>
      ))}
      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
