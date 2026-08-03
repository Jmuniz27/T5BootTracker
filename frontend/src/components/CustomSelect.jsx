import { useState, useRef, useEffect, useId } from 'react'

/**
 * Select accesible siguiendo el patron APG "Listbox" (variante en la que el
 * foco se mueve al listbox al desplegarse).
 *
 * CB-75: la version anterior era un <button> con una <ul> de <li onClick>. No
 * declaraba ningun rol ARIA ni soportaba teclado, asi que era imposible de usar
 * sin mouse y los lectores de pantalla no anunciaban ni el estado desplegado ni
 * las opciones disponibles (WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value).
 *
 * El disparador se mantiene como <button> nativo a proposito: su nombre
 * accesible sale del contenido (la opcion seleccionada), cosa que el rol
 * `combobox` no permite.
 *
 * `testId`/`data-testid` se conservan tal cual (HST-032/009 y demas
 * escenarios de la suite Playwright los usan como selector estable).
 */
export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar',
  disabled = false,
  label,
  // Nombre accesible del control. Necesario cuando hay varios selects iguales en
  // la pantalla y el texto visible no alcanza para distinguirlos.
  ariaLabel,
  // Gancho para la suite E2E de Playwright.
  testId,
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const ref = useRef(null)
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const listboxId = useId()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  // Al desplegarse, el foco pasa al listbox; la opcion activa se comunica con
  // aria-activedescendant y se mantiene a la vista en listas largas.
  useEffect(() => {
    if (!open) return
    listRef.current?.focus?.()
  }, [open])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    listRef.current?.children?.[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex])

  const close = ({ restoreFocus = true } = {}) => {
    setOpen(false)
    setActiveIndex(-1)
    if (restoreFocus) buttonRef.current?.focus?.()
  }

  const openList = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  const commit = (index) => {
    const option = options[index]
    if (option) onChange(option.value)
    close()
  }

  const handleTriggerKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    openList()
  }

  const handleListKeyDown = (event) => {
    const last = options.length - 1
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((i) => (i >= last ? 0 : i + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((i) => (i <= 0 ? last : i - 1))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(last)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        commit(activeIndex)
        break
      case 'Tab':
        close({ restoreFocus: false })
        break
      default:
        break
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close({ restoreFocus: false }) : openList())}
        onKeyDown={handleTriggerKeyDown}
        className="w-full pl-3 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213A8E] bg-white text-left whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {selected ? selected.label : placeholder}
        <svg
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={label ?? selected?.label ?? placeholder}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          onKeyDown={handleListKeyDown}
          className="absolute z-50 mt-1 min-w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg focus:outline-none animate-fade-in"
        >
          {options.map((o, index) => (
            <li
              key={o.value}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={value === o.value}
              data-testid={testId ? `${testId}-option` : undefined}
              data-value={o.value}
              onClick={() => commit(index)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                value === o.value ? 'text-[#213A8E] font-medium bg-blue-50' : 'text-gray-700'
              } ${index === activeIndex ? 'bg-blue-50 text-[#213A8E]' : ''}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
