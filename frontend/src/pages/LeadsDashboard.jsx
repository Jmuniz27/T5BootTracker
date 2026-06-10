import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLeads, assignLead, releaseLead, getInteractions, createLead } from '../api/leads.api'

const PAGE_SIZE = 10

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SOURCE_LABELS = {
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  LANDING_PAGE: 'Landing Page',
  MANUAL: 'Manual',
}

const SOURCE_ICON = {
  INSTAGRAM: '📷',
  WHATSAPP: '💬',
  LANDING_PAGE: '🌐',
  MANUAL: '✏️',
}

const STATUS_LABELS = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  SPEAK_COORDINATOR: 'Speak coordinator',
  CONVERTED: 'Converted',
}

const STATUS_COLORS = {
  NEW: 'bg-gray-100 text-gray-600',
  CONTACTED: 'bg-blue-100 text-blue-700',
  INTERESTED: 'bg-green-100 text-green-700',
  NOT_INTERESTED: 'bg-red-100 text-red-600',
  SPEAK_COORDINATOR: 'bg-yellow-100 text-yellow-700',
  CONVERTED: 'bg-purple-100 text-purple-700',
}

// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRating({ value }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= value ? 'text-blue-500' : 'text-gray-300'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, trend, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex-1 min-w-0 animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
        <div className="h-9 bg-gray-200 rounded w-16 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-32" />
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex-1 min-w-0">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-4xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-green-500 font-medium">{trend}</p>
    </div>
  )
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const isError = type === 'error'

  return (
    <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg">
      <span
        className={`flex items-center justify-center w-6 h-6 rounded-full text-white ${
          isError ? 'bg-red-500' : 'bg-green-500'
        }`}
      >
        {isError ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-white ml-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Skeleton Rows ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-32" /></td>
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-40" /></td>
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-24" /></td>
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-20" /></td>
      <td className="py-3.5 px-3"><div className="h-5 bg-gray-200 rounded-full w-20" /></td>
      <td className="py-3.5 px-3"><div className="h-5 bg-gray-200 rounded-full w-24" /></td>
      <td className="py-3.5 px-3"><div className="h-8 bg-gray-200 rounded-lg w-8" /></td>
    </tr>
  )
}

// ─── View Lead Modal ──────────────────────────────────────────────────────────

function ViewLeadModal({ lead, onClose }) {
  const { data: interactions = [] } = useQuery({
    queryKey: ['interactions', lead.id],
    queryFn: () => getInteractions(lead.id),
  })

  const lastInteraction = interactions[0]
  const rating = lastInteraction?.interest_level ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-8 w-96 shadow-xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-start gap-4 mb-5">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-500 shrink-0">
            {lead.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            {rating !== null ? (
              <>
                <p className="text-xs text-gray-400 mb-0.5">Last rating:</p>
                <p className="text-3xl font-bold text-gray-900 leading-none mb-1">{rating.toFixed(1)}</p>
                <StarRating value={rating} />
                <p className="text-xs text-gray-400 mt-1">Based on last interaction</p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-4">No interactions yet</p>
            )}
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100">{lead.name}</h2>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold text-gray-700 mb-0.5">Contact:</p>
            <p className="text-gray-600">{lead.email || '—'}&nbsp;|&nbsp;{lead.phone}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 mb-0.5">Source:</p>
            <p className="text-gray-600">{SOURCE_ICON[lead.source]} {SOURCE_LABELS[lead.source] || lead.source}</p>
          </div>
          {lastInteraction?.notes && (
            <div>
              <p className="font-semibold text-gray-700 mb-0.5">Last note:</p>
              <p className="text-gray-600">{lastInteraction.notes}</p>
            </div>
          )}
          {lead.program_interest && (
            <div>
              <p className="font-semibold text-gray-700 mb-0.5">Program interest:</p>
              <p className="text-gray-600">{lead.program_interest}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Release Lead Modal ───────────────────────────────────────────────────────

function ReleaseLeadModal({ lead, onKeep, onRelease, isLoading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-8 w-[420px] shadow-xl text-center">
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          Are you sure you want to proceed with releasing this lead?
        </h2>
        <p className="text-sm text-gray-500 mb-8">
          This lead will become available for other salespersons to pick up.
          You will lose access to their interaction history.
        </p>
        <button
          onClick={onKeep}
          disabled={isLoading}
          className="w-full py-3 rounded-xl bg-[#1e3164] text-white font-semibold mb-3 hover:bg-[#162550] transition-colors disabled:opacity-60"
        >
          Keep lead
        </button>
        <button
          onClick={onRelease}
          disabled={isLoading}
          className="w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {isLoading ? 'Releasing…' : 'Release lead'}
        </button>
      </div>
    </div>
  )
}

// ─── Create Lead Modal ────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', phone: '', email: '', source: 'MANUAL', program_interest: '' }

function CreateLeadModal({ onClose, onSubmit, isLoading }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Name is required.'
    if (!form.phone.trim()) errs.phone = 'Phone is required.'
    return errs
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    const payload = { ...form }
    if (!payload.email) delete payload.email
    if (!payload.program_interest) delete payload.program_interest
    onSubmit(payload)
  }

  const field = (label, key, type = 'text', required = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={set(key)}
        className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 ${
          errors[key] ? 'border-red-400' : 'border-gray-200'
        }`}
      />
      {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-8 w-[480px] shadow-xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-6">New Lead</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {field('Full name', 'name', 'text', true)}
          {field('Phone', 'phone', 'tel', true)}
          {field('Email', 'email', 'email', false)}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select
              value={form.source}
              onChange={set('source')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="MANUAL">Manual</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="LANDING_PAGE">Landing Page</option>
            </select>
          </div>

          {field('Program interest', 'program_interest')}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl bg-[#1e3164] text-white font-semibold hover:bg-[#162550] transition-colors disabled:opacity-60"
            >
              {isLoading ? 'Creating…' : 'Create lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Filter Dropdown ──────────────────────────────────────────────────────────

function FilterDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const options = [
    { value: '', label: 'All statuses' },
    ...Object.entries(STATUS_LABELS).map(([v, label]) => ({ value: v, label })),
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
          value ? 'border-[#1e3164] text-[#1e3164] bg-blue-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zM6 10a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zM9 16a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z" />
        </svg>
        {value ? STATUS_LABELS[value] : 'Filter'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                value === opt.value ? 'text-[#1e3164] font-semibold bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sort Dropdown ────────────────────────────────────────────────────────────

function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const options = [
    { value: 'default', label: 'Default' },
    { value: 'name_asc', label: 'Name A→Z' },
    { value: 'name_desc', label: 'Name Z→A' },
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
  ]

  const active = options.find((o) => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
          value !== 'default' ? 'border-[#1e3164] text-[#1e3164] bg-blue-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
        </svg>
        {active?.label ?? 'Sort by'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                value === opt.value ? 'text-[#1e3164] font-semibold bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Row Actions Dropdown ─────────────────────────────────────────────────────

function ActionsDropdown({ lead, isOwned, onView, onRelease, onAssign }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1e3164] text-white hover:bg-[#162550] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
          <button
            onClick={() => { onView(); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            View lead
          </button>
          {isOwned ? (
            <button
              onClick={() => { onRelease(); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Release lead
            </button>
          ) : (
            <button
              onClick={() => { onAssign(); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Assign lead
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
      <p className="text-sm text-gray-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={page === 1}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← Prev
        </button>
        <button
          onClick={onNext}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// ─── Sort helper ──────────────────────────────────────────────────────────────

function sortLeads(leads, sortKey) {
  const copy = [...leads]
  switch (sortKey) {
    case 'name_asc':  return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'name_desc': return copy.sort((a, b) => b.name.localeCompare(a.name))
    case 'newest':    return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    case 'oldest':    return copy.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    default:          return copy
  }
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function LeadsDashboard() {
  const queryClient = useQueryClient()
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey, setSortKey]         = useState('default')
  const [page, setPage]               = useState(1)
  const [viewLead, setViewLead]       = useState(null)
  const [releaseTarget, setReleaseTarget] = useState(null)
  const [showCreate, setShowCreate]   = useState(false)
  const [toast, setToast]             = useState(null) // { message, type }

  const showToast = (message, type = 'success') => setToast({ message, type })

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, statusFilter, sortKey])

  const queryParams = {}
  if (search) queryParams.search = search
  if (statusFilter) queryParams.status = statusFilter

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', queryParams],
    queryFn: () => getLeads(queryParams),
  })

  const myLeads        = data?.my_leads ?? []
  const availableLeads = data?.available_leads ?? []
  const allLeads = sortLeads(
    [
      ...myLeads.map((l) => ({ ...l, _isOwned: true })),
      ...availableLeads.map((l) => ({ ...l, _isOwned: false })),
    ],
    sortKey,
  )

  const conversions  = myLeads.filter((l) => l.status === 'CONVERTED').length
  const totalPages   = Math.max(1, Math.ceil(allLeads.length / PAGE_SIZE))
  const pageLeads    = allLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const assignMutation = useMutation({
    mutationFn: assignLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      showToast('Lead assigned to you successfully!')
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Could not assign lead.'
      showToast(msg, 'error')
    },
  })

  const releaseMutation = useMutation({
    mutationFn: releaseLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setReleaseTarget(null)
      showToast('Lead released successfully.')
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Could not release lead.'
      showToast(msg, 'error')
    },
  })

  const createMutation = useMutation({
    mutationFn: createLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setShowCreate(false)
      showToast('Lead created successfully!')
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Could not create lead.'
      showToast(msg, 'error')
    },
  })

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <span>📊</span> Lead's Dashboard
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1e3164] text-white text-sm font-semibold rounded-xl hover:bg-[#162550] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Lead
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">Salesperson</p>
              <span className="text-xs bg-[#1e3164] text-white px-2 py-0.5 rounded-full">Salesperson</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-gray-300 flex items-center justify-center text-sm font-bold text-gray-600">
              G
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="flex gap-4 mb-8">
        <StatCard label="Total leads"    value={allLeads.length}   trend="+12% from last month" loading={isLoading} />
        <StatCard label="Assigned to me" value={myLeads.length}    trend="+20% from last month" loading={isLoading} />
        <StatCard label="Conversions"    value={conversions}       trend="+8% from last month"  loading={isLoading} />
        <StatCard
          label="Not interested"
          value={myLeads.filter((l) => l.status === 'NOT_INTERESTED').length}
          trend="+8% from last month"
          loading={isLoading}
        />
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Available Leads</h2>

        {/* Search + controls */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <SortDropdown value={sortKey} onChange={setSortKey} />
          <FilterDropdown value={statusFilter} onChange={setStatusFilter} />
        </div>

        {/* Table */}
        {isError && (
          <p className="text-center text-red-500 py-8 text-sm">
            Could not load leads. Make sure you are logged in.
          </p>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Name', 'Mail', 'Phone', 'Source', 'Status', 'Assigned To', 'Actions'].map((h) => (
                <th key={h} className="text-left py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && !isError && pageLeads.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 py-10">
                  No leads found.
                </td>
              </tr>
            )}

            {!isLoading && !isError && pageLeads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-3.5 px-3 font-medium text-gray-900">{lead.name}</td>
                <td className="py-3.5 px-3 text-gray-500">{lead.email || '—'}</td>
                <td className="py-3.5 px-3 text-gray-500">{lead.phone}</td>
                <td className="py-3.5 px-3 text-gray-500">{SOURCE_LABELS[lead.source] || lead.source}</td>
                <td className="py-3.5 px-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[lead.status] ?? lead.status}
                  </span>
                </td>
                <td className="py-3.5 px-3">
                  {lead._isOwned ? (
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                        {lead.owner_name?.charAt(0) ?? 'Y'}
                      </div>
                      <span className="text-gray-700 text-sm">You</span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                      Unassigned
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-3">
                  <ActionsDropdown
                    lead={lead}
                    isOwned={lead._isOwned}
                    onView={() => setViewLead(lead)}
                    onRelease={() => setReleaseTarget(lead)}
                    onAssign={() => assignMutation.mutate(lead.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </div>

      {/* Modals */}
      {viewLead && <ViewLeadModal lead={viewLead} onClose={() => setViewLead(null)} />}

      {releaseTarget && (
        <ReleaseLeadModal
          lead={releaseTarget}
          isLoading={releaseMutation.isPending}
          onKeep={() => setReleaseTarget(null)}
          onRelease={() => releaseMutation.mutate(releaseTarget.id)}
        />
      )}

      {showCreate && (
        <CreateLeadModal
          onClose={() => setShowCreate(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
