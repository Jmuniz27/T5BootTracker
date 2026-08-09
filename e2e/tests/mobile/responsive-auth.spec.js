import { test, expect } from '@playwright/test'
import { titulo, dado, y, cuando, entonces } from '../support/gwt.js'
import { desborde, SIN_DESBORDE } from '../support/viewport.js'

/**
 * Las pantallas públicas de autenticación en un teléfono.
 *
 * Todas comparten `AuthLayout`, así que lo que se mide acá es lo que jsdom no
 * puede: que el documento no se desborde, que el botón principal quede a la
 * vista sin desplazar, y que el logo no pise la tarjeta.
 *
 * Ninguno de estos escenarios muta estado ni necesita sesión: se navega a rutas
 * públicas. Es lo que les permite convivir con la suite serial, que comparte los
 * datos de `seed_dev`.
 */

// 360x520: un teléfono chico, y también cualquier Android que encoge el
// viewport al abrir el teclado. El alto importa porque `AuthLayout` centra
// verticalmente: es cuando el contenido es alto respecto de la ventana que el
// centrado empuja la tarjeta por debajo del logo.
const TELEFONO_BAJO = { width: 360, height: 520 }

/** Las cuatro pantallas del flujo de recuperación, más el estado de enlace vencido. */
const PANTALLAS = [
  { ruta: '/forgot-password', titulo: /olvidaste tu/i, accion: /restablecer contraseña/i },
  { ruta: '/check-email', titulo: /revisa tu correo/i, accion: /reenviar correo/i },
  { ruta: '/reset-success', titulo: /contraseña actualizada/i, accion: /ir al inicio de sesión/i },
]

test.describe('Responsive · las pantallas de autenticación en el teléfono', () => {
  for (const pantalla of PANTALLAS) {
    test(
      titulo({
        hst: 'CB-352',
        dado: `la pantalla ${pantalla.ruta} en un teléfono`,
        cuando: 'el usuario la abre',
        entonces: 'la lee completa, sin scroll horizontal y con la acción a la vista',
      }),
      async ({ page }) => {
        await dado(`que se abre ${pantalla.ruta} en una ventana baja`, async () => {
          await page.setViewportSize(TELEFONO_BAJO)
          await page.goto(pantalla.ruta)
          await expect(page.getByRole('heading', { name: pantalla.titulo })).toBeVisible()
        })

        await entonces('la página no se sale del ancho de la pantalla', async () => {
          expect(await desborde(page)).toBeLessThanOrEqual(SIN_DESBORDE)
        })

        await y('el título entra completo en la ventana', async () => {
          await expect(page.getByRole('heading', { name: pantalla.titulo })).toBeInViewport({ ratio: 1 })
        })

        await y('el botón principal queda a la vista sin desplazar nada', async () => {
          await expect(page.getByRole('button', { name: pantalla.accion })).toBeInViewport({ ratio: 1 })
        })

        await y('el logo queda por encima de la tarjeta, sin taparla', async () => {
          const logo = await page.getByAltText('Coding Bootcamps ESPOL').boundingBox()
          const tarjeta = await page.locator('.max-w-md').first().boundingBox()

          expect(logo.y + logo.height).toBeLessThanOrEqual(tarjeta.y)
        })
      },
    )
  }

  test(
    titulo({
      hst: 'CB-352',
      dado: 'un enlace de invitación que ya no sirve',
      cuando: 'el bootcamper lo abre desde el teléfono',
      entonces: 'el aviso se lee centrado y sin desbordar la pantalla',
    }),
    async ({ page }) => {
      // Un token basura provoca el estado de enlace inválido, que comparte el
      // markup con el de enlace expirado. Provocar TOKEN_EXPIRED de verdad
      // exigiría convertir un lead y envejecer su token, o sea mutar estado.
      await dado('que abre una invitación con un token que no existe', async () => {
        await page.setViewportSize(TELEFONO_BAJO)
        await page.goto('/onboarding/token-que-no-existe')
        await expect(page.getByRole('heading', { name: /enlace inválido/i })).toBeVisible()
      })

      await entonces('la página no se sale del ancho de la pantalla', async () => {
        expect(await desborde(page)).toBeLessThanOrEqual(SIN_DESBORDE)
      })

      await y('el aviso queda centrado y no pegado al borde', async () => {
        const aviso = await page.getByRole('heading', { name: /enlace inválido/i }).boundingBox()
        const ventana = page.viewportSize()

        // Sin `text-center` el texto arranca en el borde izquierdo mientras el
        // logo va centrado, que es el desbalance que reportó el cliente.
        const margenIzquierdo = aviso.x
        const margenDerecho = ventana.width - (aviso.x + aviso.width)
        expect(Math.abs(margenIzquierdo - margenDerecho)).toBeLessThanOrEqual(2)
      })
    },
  )

  test(
    titulo({
      hst: 'CB-352',
      dado: 'una sesión que caducó por inactividad',
      cuando: 'el usuario aterriza en el inicio de sesión',
      entonces: 'entiende por qué lo sacaron y puede volver a entrar',
    }),
    async ({ page }) => {
      await dado('que la sesión caducada lo devuelve al login', async () => {
        await page.setViewportSize(TELEFONO_BAJO)
        await page.goto('/login?expired=1')
      })

      await cuando('la pantalla termina de cargar', async () => {
        await expect(page.getByTestId('login-submit')).toBeVisible()
      })

      await entonces('el aviso explica que la sesión expiró', async () => {
        await expect(page.getByRole('status')).toContainText(/tu sesión expiró/i)
      })

      await y('el aviso no empuja el botón de ingresar fuera de la pantalla', async () => {
        await expect(page.getByTestId('login-submit')).toBeInViewport({ ratio: 1 })
        expect(await desborde(page)).toBeLessThanOrEqual(SIN_DESBORDE)
      })
    },
  )
})
