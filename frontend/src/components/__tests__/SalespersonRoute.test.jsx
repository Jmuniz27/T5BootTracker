import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import SalespersonRoute from '../SalespersonRoute'
import { useAuthStore } from '../../store/auth.store'

vi.mock('../../store/auth.store', () => ({ useAuthStore: vi.fn() }))

function renderWithRole(role) {
  useAuthStore.mockImplementation((selector) => selector({ user: role ? { role } : null }))
  return render(
    <MemoryRouter initialEntries={['/agenda']}>
      <Routes>
        <Route
          path="/agenda"
          element={
            <SalespersonRoute>
              <div>AGENDA</div>
            </SalespersonRoute>
          }
        />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SalespersonRoute', () => {
  it('deja pasar a un SALESPERSON', () => {
    renderWithRole('SALESPERSON')
    expect(screen.getByText('AGENDA')).toBeInTheDocument()
  })

  it('redirige a dashboard a un ADMINISTRATOR', () => {
    renderWithRole('ADMINISTRATOR')
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument()
  })

  it('redirige si no hay usuario', () => {
    renderWithRole(null)
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument()
  })
})
