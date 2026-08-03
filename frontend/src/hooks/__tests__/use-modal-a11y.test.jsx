import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useModalA11y } from '../use-modal-a11y'

function Dialog({ onClose }) {
  const ref = useModalA11y(onClose)
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Demo">
      <button>Primero</button>
      <button>Segundo</button>
    </div>
  )
}

function Harness({ onClose }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      {open && <Dialog onClose={() => { setOpen(false); onClose?.() }} />}
    </>
  )
}

describe('useModalA11y (CB-75)', () => {
  it('cierra con Escape', async () => {
    const onClose = vi.fn()
    render(<Dialog onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('mueve el foco al primer elemento enfocable del diálogo', () => {
    render(<Dialog onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Primero' })).toHaveFocus()
  })

  it('atrapa el foco: Tab desde el último vuelve al primero', async () => {
    render(<Dialog onClose={() => {}} />)
    const [first, second] = screen.getAllByRole('button')

    await userEvent.tab()
    expect(second).toHaveFocus()

    await userEvent.tab()
    expect(first).toHaveFocus()
  })

  it('atrapa el foco hacia atrás: Shift+Tab desde el primero va al último', async () => {
    render(<Dialog onClose={() => {}} />)
    const [first, second] = screen.getAllByRole('button')
    expect(first).toHaveFocus()

    await userEvent.tab({ shift: true })
    expect(second).toHaveFocus()
  })

  it('bloquea el scroll del body mientras está abierto y lo restaura al cerrar', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(document.body.style.overflow).toBe('hidden')

    await userEvent.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('')
  })

  it('devuelve el foco al elemento que abrió el diálogo', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })
})
