import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLeads, assignLead, releaseLead, getInteractions } from '../api/leads.api'

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, trend }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex-1 min-w-0">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-4xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-green-500 font-medium">{trend}</p>
    </div>
  )
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg">
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
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
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Avatar + rating */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-500 shrink-0">
            {lead.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            {rating !== null && (
              <>
                <p className="text-xs text-gray-400 mb-0.5">Last rating:</p>
                <p className="text-3xl font-bold text-gray-900 leading-none mb-1">{rating.toFixed(1)}</p>
                <StarRating value={rating} />
                <p className="text-xs text-gray-400 mt-1">Based on last interaction</p>
              </>
            )}
            {rating === null && (
              <p className="text-sm text-gray-400 mt-4">No interactions yet</p>
            )}
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100">
          {lead.name}
        </h2>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold text-gray-700 mb-0.5">Contact:</p>
            <p className="text-gray-600">
              {lead.email || '—'}&nbsp;|&nbsp;{lead.phone}
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 mb-0.5">Source:</p>
            <p className="text-gray-600">
              {SOURCE_ICON[lead.source]} {SOURCE_LABELS[lead.source] || lead.source}
            </p>
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

function ReleaseLeadModal({ lead, onConfirm, onCancel, isLoading }) {
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
          onClick={onConfirm}
          disabled={isLoading}
          className="w-full py-3 rounded-xl bg-[#1e3164] text-white font-semibold mb-3 hover:bg-[#162550] transition-colors disabled:opacity-60"
        >
          {isLoading ? 'Releasing…' : 'Keep lead'}
        </button>
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          Release lead
        </button>
      </div>
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
        className={`flex items-center justify-center w-8 h-8 rounded-lg bg-[#1e3164] text-white hover:bg-[#162550] transition-colors ${open ? 'rounded-r-none' : ''}`}
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

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function LeadsDashboard() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [viewLead, setViewLead] = useState(null)
  const [releaseLead, setReleaseLead] = useState(null)
  const [toast, setToast] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', search],
    queryFn: () => getLeads(search ? { search } : {}),
  })

  const myLeads = data?.my_leads ?? []
  const availableLeads = data?.available_leads ?? []
  const allLeads = [
    ...myLeads.map((l) => ({ ...l, _isOwned: true })),
    ...availableLeads.map((l) => ({ ...l, _isOwned: false })),
  ]

  const conversions = myLeads.filter((l) => l.status === 'CONVERTED').length

  const assignMutation = useMutation({
    mutationFn: assignLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setToast('New lead assigned to you successfully!')
    },
  })

  const releaseMutation = useMutation({
    mutationFn: releaseLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setReleaseLead(null)
      setToast('Lead released successfully.')
    },
  })

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <span>📊</span> Lead's Dashboard
        </h1>
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

      {/* Stat Cards */}
      <div className="flex gap-4 mb-8">
        <StatCard
          label="Total leads"
          value={isLoading ? '…' : allLeads.length}
          trend="+12% from last month"
        />
        <StatCard
          label="Assigned to me"
          value={isLoading ? '…' : myLeads.length}
          trend="+20% from last month"
        />
        <StatCard
          label="Conversions"
          value={isLoading ? '…' : conversions}
          trend="+8% from last month"
        />
        <StatCard
          label="Completed"
          value={isLoading ? '…' : myLeads.filter((l) => l.status === 'NOT_INTERESTED').length}
          trend="+8% from last month"
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
          <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Sort by
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zM6 10a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zM9 16a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z" />
            </svg>
            Filter
          </button>
        </div>

        {/* Table */}
        {isError && (
          <p className="text-center text-red-500 py-8 text-sm">
            Could not load leads. Make sure you are logged in.
          </p>
        )}
        {isLoading && (
          <p className="text-center text-gray-400 py-8 text-sm">Loading…</p>
        )}
        {!isLoading && !isError && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Name', 'Mail', 'Phone', 'Source', 'Assigned To', 'Actions'].map((h) => (
                  <th key={h} className="text-left py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {allLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-10">
                    No leads found.
                  </td>
                </tr>
              )}
              {allLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3.5 px-3 font-medium text-gray-900">{lead.name}</td>
                  <td className="py-3.5 px-3 text-gray-500">{lead.email || '—'}</td>
                  <td className="py-3.5 px-3 text-gray-500">{lead.phone}</td>
                  <td className="py-3.5 px-3 text-gray-500">{SOURCE_LABELS[lead.source] || lead.source}</td>
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
                      onRelease={() => setReleaseLead(lead)}
                      onAssign={() => assignMutation.mutate(lead.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {viewLead && (
        <ViewLeadModal lead={viewLead} onClose={() => setViewLead(null)} />
      )}

      {releaseLead && (
        <ReleaseLeadModal
          lead={releaseLead}
          isLoading={releaseMutation.isPending}
          onConfirm={() => setReleaseLead(null)}
          onCancel={() => releaseMutation.mutate(releaseLead.id)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
