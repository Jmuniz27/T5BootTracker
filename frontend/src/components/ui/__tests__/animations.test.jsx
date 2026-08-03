import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import PageTransition from '../PageTransition'
import Skeleton from '../Skeleton'
import Spinner from '../Spinner'
import StatCard from '../../StatCard'

const SRC = path.resolve(__dirname, '../../..')

describe('CB-114 — transiciones y micro-interacciones', () => {
  it('la vista de una ruta entra con una transición de ≤200ms', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<PageTransition><p>Contenido</p></PageTransition>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Contenido').parentElement).toHaveClass('animate-fade-in-up')
  })

  it('la transición no bloquea la interacción con la vista', async () => {
    render(
      <MemoryRouter>
        <PageTransition><button>Crear lead</button></PageTransition>
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: 'Crear lead' })
    expect(button).toBeEnabled()
    expect(button.parentElement).not.toHaveClass('pointer-events-none')
  })

  it('remonta la vista al navegar, para que la animación se reproduzca de nuevo', async () => {
    render(
      <MemoryRouter initialEntries={['/a']}>
        <nav><Link to="/b">Ir a B</Link></nav>
        <Routes>
          <Route path="/a" element={<PageTransition><p data-testid="view">A</p></PageTransition>} />
          <Route path="/b" element={<PageTransition><p data-testid="view">B</p></PageTransition>} />
        </Routes>
      </MemoryRouter>,
    )
    const before = screen.getByTestId('view')
    expect(before).toHaveTextContent('A')

    await userEvent.click(screen.getByRole('link', { name: 'Ir a B' }))

    const after = screen.getByTestId('view')
    expect(after).toHaveTextContent('B')
    expect(after).not.toBe(before)
    expect(after.parentElement).toHaveClass('animate-fade-in-up')
  })

  it('el skeleton se oculta a los lectores de pantalla', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstChild.firstChild).toHaveClass('animate-shimmer')
  })

  it('el spinner es decorativo', () => {
    const { container } = render(<Spinner />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstChild).toHaveClass('animate-spin')
  })

  it('StatCard muestra skeleton mientras carga, no una tarjeta en blanco', () => {
    const { rerender } = render(<StatCard label="Total leads" loading />)
    const busy = screen.getByLabelText('Cargando Total leads')
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelectorAll('.animate-shimmer').length).toBeGreaterThan(0)

    rerender(<StatCard label="Total leads" value={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('respeta prefers-reduced-motion de forma global', () => {
    const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8')
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
    expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
  })

  it('las animaciones declaradas duran ≤200ms', () => {
    const config = fs.readFileSync(path.join(SRC, '..', 'tailwind.config.js'), 'utf8')
    const entryPattern = /'(fade-in|fade-in-up|zoom-in|slide-in-right)':\s*'[a-z-]+ (\d+)ms/g
    const durations = [...config.matchAll(entryPattern)].map((m) => Number(m[2]))

    expect(durations).toHaveLength(4)
    durations.forEach((ms) => expect(ms).toBeLessThanOrEqual(200))
  })
})
