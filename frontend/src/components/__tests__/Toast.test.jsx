import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toast from '../Toast'

describe('Toast — anuncio a lectores de pantalla (CB-75)', () => {
  afterEach(() => { vi.useRealTimers() })

  it('anuncia los éxitos de forma cortés', () => {
    render(<Toast message="Pago aprobado." onClose={() => {}} />)
    const toast = screen.getByRole('status')
    expect(toast).toHaveAttribute('aria-live', 'polite')
    expect(toast).toHaveTextContent('Pago aprobado.')
  })

  it('anuncia los errores de forma asertiva', () => {
    render(<Toast message="Falló la carga." type="error" onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
  })

  it('el botón de cierre tiene nombre accesible', async () => {
    const onClose = vi.fn()
    render(<Toast message="Hola" onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /cerrar notificación/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('se auto-cierra a los 4s aunque el padre re-renderice con un onClose nuevo', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    // Un padre que pasa una arrow inline devuelve una identidad distinta en cada
    // render. Antes eso reiniciaba el temporizador y el toast no se cerraba.
    const { rerender } = render(<Toast message="Hola" onClose={() => onClose()} />)

    act(() => { vi.advanceTimersByTime(3000) })
    rerender(<Toast message="Hola" onClose={() => onClose()} />)
    act(() => { vi.advanceTimersByTime(1500) })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
