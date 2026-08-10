import React from 'react'
import { render, screen } from '@testing-library/react'
import AuthInput from '../AuthInput'

describe('AuthInput', () => {
  it('el texto del campo mide al menos 16px, para que Safari no haga zoom al enfocar', () => {
    render(<AuthInput placeholder="correo" />)

    // Safari en iOS amplía la página al enfocar un campo con `font-size` menor
    // a 16px y no vuelve atrás: el usuario termina de llenar el formulario con
    // la página ampliada, desplazándose de lado entre campos. No hay forma de
    // desactivarlo por CSS, y fijar `maximum-scale=1` en el viewport lo ignoran
    // los iOS modernos además de romper accesibilidad. La única salida es el
    // tamaño de fuente — o sea que volver a `text-sm` reintroduce el problema
    // en las 7 pantallas de auth sin que se note en escritorio.
    const input = screen.getByPlaceholderText('correo')
    expect(input).toHaveClass('text-base')
    expect(input).not.toHaveClass('text-sm')
  })

  it('muestra el error debajo del campo', () => {
    render(<AuthInput placeholder="correo" error="Correo inválido" />)
    expect(screen.getByText('Correo inválido')).toBeInTheDocument()
  })
})
