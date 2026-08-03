import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomSelect from '../CustomSelect'

const OPTIONS = [
  { value: 'all', label: 'Todos los segmentos' },
  { value: 'new', label: 'Nuevos' },
  { value: 'hot', label: 'Calientes' },
]

function setup(value = 'all') {
  const onChange = vi.fn()
  render(<CustomSelect value={value} onChange={onChange} options={OPTIONS} label="Segmento" />)
  return { onChange, trigger: screen.getByRole('button') }
}

describe('CustomSelect — accesibilidad y teclado (CB-75)', () => {
  it('expone estado desplegable en el disparador', async () => {
    const { trigger } = setup()
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('mantiene el nombre accesible del disparador en la opción seleccionada', () => {
    setup('hot')
    expect(screen.getByRole('button', { name: /calientes/i })).toBeInTheDocument()
  })

  it('marca la opción seleccionada con aria-selected', async () => {
    const { trigger } = setup('new')
    await userEvent.click(trigger)
    expect(screen.getByRole('option', { name: 'Nuevos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Calientes' })).toHaveAttribute('aria-selected', 'false')
  })

  it('abre con ArrowDown y selecciona con Enter', async () => {
    const { onChange, trigger } = setup('all')
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('new')
  })

  it('cicla al final de la lista con ArrowUp', async () => {
    const { onChange, trigger } = setup('all')
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    expect(onChange).toHaveBeenCalledWith('hot')
  })

  it('Escape cierra y devuelve el foco al disparador', async () => {
    const { trigger } = setup()
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('End salta a la última opción', async () => {
    const { onChange, trigger } = setup('all')
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}{End}{Enter}')
    expect(onChange).toHaveBeenCalledWith('hot')
  })

  it('conserva data-testid/data-value para la suite E2E (HST-032/009)', async () => {
    const onChange = vi.fn()
    render(<CustomSelect value="all" onChange={onChange} options={OPTIONS} testId="interaction-type" />)
    const trigger = screen.getByTestId('interaction-type')
    await userEvent.click(trigger)
    const option = screen.getAllByTestId('interaction-type-option')[1]
    expect(option).toHaveAttribute('data-value', 'new')
  })
})
