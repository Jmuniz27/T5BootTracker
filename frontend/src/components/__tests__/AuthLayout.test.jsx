import React from 'react'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import AuthLayout from '../AuthLayout'

// jsdom no resuelve media queries ni calcula posiciones, así que lo que se
// puede afirmar acá son las clases que deciden el comportamiento por tamaño.
// La comprobación real —que el logo no se solape con el formulario— vive en
// e2e/tests/mobile/.
const renderLayout = (children = <p>contenido</p>) =>
  render(
    <BrowserRouter>
      <AuthLayout>{children}</AuthLayout>
    </BrowserRouter>,
  )

describe('AuthLayout', () => {
  it('renderiza a sus hijos', () => {
    renderLayout(<p>formulario</p>)
    expect(screen.getByText('formulario')).toBeInTheDocument()
  })

  it('el logo sólo flota sobre el contenido en escritorio', () => {
    renderLayout()
    const logo = screen.getByAltText('Coding Bootcamps ESPOL').closest('div')

    // Absoluto en pantallas chicas se superponía al formulario de activación:
    // nada reservaba su espacio. Desde `lg` la tarjeta ya no lo cruza.
    expect(logo).toHaveClass('lg:absolute')
    expect(logo).not.toHaveClass('absolute')
  })

  it('el logo y el contenido se apilan, con menos padding lateral en móvil', () => {
    const { container } = renderLayout()
    const raiz = container.firstChild

    expect(raiz).toHaveClass('flex-col')
    expect(raiz).toHaveClass('px-5', 'sm:px-8')
  })
})
