import { useState, useRef, useEffect } from 'react'

export default function CustomSelect({ value, onChange, options, placeholder = 'Seleccionar', testId }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find((o) => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        className="w-full pl-3 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-left whitespace-nowrap"
      >
        {selected ? selected.label : placeholder}
        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="absolute z-50 mt-1 min-w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {options.map((o) => (
            <li
              key={o.value}
              data-testid={testId ? `${testId}-option` : undefined}
              data-value={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-blue-50 hover:text-[#213A8E] transition-colors ${
                value === o.value ? 'text-[#213A8E] font-medium bg-blue-50' : 'text-gray-700'
              }`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
