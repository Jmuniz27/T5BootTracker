import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import SessionTimeoutWarning from '../SessionTimeoutWarning'

// El aviso flota sobre el contenido en cualquier pantalla, así que su ancho es lo
// único que puede desbordar. jsdom no mide, pero sí puede verificar que el ancho
// esté acotado al viewport en vez de fijado en píxeles.
describe('SessionTimeoutWarning (HST-003)', () => {
  it('avisa que la sesión está por expirar', () => {
    render(<SessionTimeoutWarning onStayConnected={() => {}} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/tu sesión está por expirar/i)
  })

  it('su ancho queda acotado al viewport', () => {
    render(<SessionTimeoutWarning onStayConnected={() => {}} />)

    expect(screen.getByRole('alert')).toHaveClass('w-[min(90vw,28rem)]')
  })

  it('el botón es un atajo para renovar la sesión', () => {
    const seguirConectado = vi.fn()
    render(<SessionTimeoutWarning onStayConnected={seguirConectado} />)

    fireEvent.click(screen.getByRole('button', { name: /seguir conectado/i }))

    expect(seguirConectado).toHaveBeenCalledTimes(1)
  })
})
