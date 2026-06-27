import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getMonitoring, getPrograms } from '../api/payments.api'
import StatCard from '../components/StatCard'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS = {
  ON_TRACK: { label: 'Al día',    bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  AT_RISK:  { label: 'En riesgo', bg: 'bg-amber-100',   text: 'text-amber-700',   bar: 'bg-amber-500'   },
  CRITICAL: { label: 'Crítico',   bg: 'bg-red-100',     text: 'text-red-600',     bar: 'bg-red-500'     },
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(v) {
  if (v == null) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Bootcamper Card ──────────────────────────────────────────────────────────

function BootcamperCard({ bc, onClick }) {
  const cfg       = STATUS[bc.payment_status] || STATUS.ON_TRACK
  const totalCost = parseFloat(bc.total_cost) || 1
  const totalPaid = parseFloat(bc.total_paid) || 0
  const paidPct   = Math.min((totalPaid / totalCost) * 100, 100)

  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:shadow-md hover:border-[#1D3176]/30 transition-all w-full group"
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(bc.bootcamper_name ?? 'bootcamper')}`}
            alt={bc.bootcamper_name}
            className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0 object-cover"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-[#1D3176] transition-colors truncate">
              {bc.bootcamper_name}
            </p>
            <p className="text-xs text-gray-400 truncate">{bc.email}</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ml-2 ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>

      {/* Program */}
      <p className="text-xs text-gray-500 mb-3 truncate">{bc.program_name}</p>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-400">Pagado</span>
          <span className="text-xs font-semibold text-gray-700">{paidPct.toFixed(0)}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${paidPct}%` }} />
        </div>
      </div>

      {/* Amounts */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-lg font-bold text-gray-900 leading-tight">{fmt(bc.total_paid)}</p>
          <p className="text-xs text-gray-400">de {fmt(bc.total_cost)}</p>
        </div>
        {bc.pending_payments > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {bc.pending_payments} pendiente{bc.pending_payments !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-100 rounded w-40" />
        </div>
      </div>
      <div className="h-3 bg-gray-100 rounded w-24 mb-3" />
      <div className="h-1.5 bg-gray-100 rounded-full mb-3" />
      <div className="flex justify-between">
        <div className="h-5 bg-gray-200 rounded w-20" />
        <div className="h-5 bg-gray-100 rounded w-16" />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SalespersonPaymentsPage() {
  const navigate = useNavigate()
  const [search, setSearch]             = useState('')
  const [programId, setProgramId]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data: bootcampers = [], isLoading, isFetching } = useQuery({
    queryKey: ['payment-monitoring', { programId, statusFilter }],
    queryFn: () => getMonitoring({
      program_id: programId || undefined,
      status:     statusFilter || undefined,
    }),
  })

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
  })

  const filtered = search
    ? bootcampers.filter(
        (bc) =>
          bc.bootcamper_name.toLowerCase().includes(search.toLowerCase()) ||
          bc.email.toLowerCase().includes(search.toLowerCase()),
      )
    : bootcampers

  const stats = {
    total:    bootcampers.length,
    critical: bootcampers.filter((b) => b.payment_status === 'CRITICAL').length,
    atRisk:   bootcampers.filter((b) => b.payment_status === 'AT_RISK').length,
    onTrack:  bootcampers.filter((b) => b.payment_status === 'ON_TRACK').length,
  }

  const handleCardClick = (bc) => {
    navigate(`/payments/${bc.bootcamper_id}/${bc.program_id}`, { state: { bc } })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoreo de Pagos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Avance de pagos por bootcamper</p>
        </div>
      </div>

      {/* Summary stats */}
      {!isLoading && bootcampers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Bootcampers" value={stats.total} />
          <StatCard
            label="Críticos"
            value={stats.critical}
            containerClass="bg-red-50 border-red-100"
            valueClass="text-red-600"
            labelClass="text-red-400"
          />
          <StatCard
            label="En riesgo"
            value={stats.atRisk}
            containerClass="bg-amber-50 border-amber-100"
            valueClass="text-amber-600"
            labelClass="text-amber-400"
          />
          <StatCard
            label="Al día"
            value={stats.onTrack}
            containerClass="bg-emerald-50 border-emerald-100"
            valueClass="text-emerald-600"
            labelClass="text-emerald-400"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 items-center">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
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
        <div className="relative">
          <select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="pl-3 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none bg-white"
          >
            <option value="">Todos los programas</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-3 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none bg-white"
          >
            <option value="">Todos los estados</option>
            <option value="CRITICAL">Crítico</option>
            <option value="AT_RISK">En riesgo</option>
            <option value="ON_TRACK">Al día</option>
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {isFetching && !isLoading && (
          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm text-gray-500">
            {search ? 'No se encontraron bootcampers con ese nombre o email.' : 'Sin bootcampers activos en este programa.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((bc) => (
            <BootcamperCard
              key={`${bc.bootcamper_id}-${bc.program_id}`}
              bc={bc}
              onClick={() => handleCardClick(bc)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
