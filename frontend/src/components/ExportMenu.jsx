import { useState, useRef, useEffect } from 'react'
import { exportToCsv, exportToPdf } from '../lib/export'

/**
 * Botón de exportación con menú CSV / PDF (S4-5).
 *
 * `fetchRows` puede ser async: los listados paginados necesitan traer todas las
 * páginas antes de exportar, no solo la que se está viendo.
 */
export default function ExportMenu({
  columns,
  fetchRows,
  baseName,
  title,
  subtitle,
  disabled = false,
  onError,
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null) // 'csv' | 'pdf' | null
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const run = async (format) => {
    setOpen(false)
    setBusy(format)
    try {
      const rows = await fetchRows()
      if (!rows.length) {
        onError?.('No hay datos para exportar con los filtros actuales.')
        return
      }
      if (format === 'csv') {
        exportToCsv(rows, columns, baseName)
      } else {
        await exportToPdf(rows, columns, { baseName, title, subtitle })
      }
    } catch {
      onError?.('No se pudo generar el reporte. Intenta de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  const label = busy ? 'Generando…' : 'Exportar'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || Boolean(busy)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => run('csv')}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-[#213A8E] transition-colors"
          >
            Excel (CSV)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run('pdf')}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-[#213A8E] transition-colors"
          >
            PDF
          </button>
        </div>
      )}
    </div>
  )
}
