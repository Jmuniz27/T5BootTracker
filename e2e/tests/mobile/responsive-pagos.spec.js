import { test, expect } from '@playwright/test'
import { titulo, dado, y, cuando, entonces } from '../support/gwt.js'
import { STORAGE_STATE } from '../support/users.js'

/**
 * Comprobaciones de responsive que sólo tienen sentido en un navegador real.
 *
 * jsdom no tiene motor de layout: no resuelve media queries, `display: none`
 * no se computa y `getBoundingClientRect` devuelve ceros. Todo lo que se puede
 * afirmar allá son clases; acá se miden desbordes y posiciones de verdad.
 *
 * Ninguno de estos escenarios muta estado: sólo navegan y abren ventanas. Es
 * lo que les permite convivir con la suite serial, que comparte los datos de
 * `seed_dev`. Si alguna vez hace falta crear o aprobar algo, va en otro
 * archivo y bajo el proyecto `chromium`.
 */

/** Cuánto se sale el documento del ancho de la ventana. 0 = no se sale. */
const desborde = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

// Un píxel de tolerancia: los redondeos subpíxel de Chromium al escalar dan
// diferencias de <1px que no son un desborde real.
const SIN_DESBORDE = 1

test.describe('Responsive · el bootcamper opera desde el teléfono', () => {
  test.use({ storageState: STORAGE_STATE.bootcamper })

  test(
    titulo({
      hst: 'CB-342',
      dado: 'un bootcamper en un teléfono',
      cuando: 'abre su panel de pagos',
      entonces: 'lee el historial sin scroll horizontal y con las acciones a mano',
    }),
    async ({ page }) => {
      await dado('que el bootcamper abre sus pagos en un teléfono', async () => {
        await page.goto('/payments')
        await expect(page.getByTestId('upload-button')).toBeVisible()
      })

      await entonces('la página no se sale del ancho de la pantalla', async () => {
        expect(await desborde(page)).toBeLessThanOrEqual(SIN_DESBORDE)
      })

      await y('el historial se presenta como tarjetas y no como tabla', async () => {
        // La tabla exige 600px: en un teléfono deja la columna de acciones
        // fuera de pantalla, que es justo la única interactiva.
        await expect(page.getByTestId('payments-card-list')).toBeVisible()
        await expect(page.getByTestId('payments-table-wrapper')).toBeHidden()
      })
    },
  )

  test(
    titulo({
      hst: 'CB-342',
      dado: 'un pago en el historial de un teléfono',
      cuando: 'el bootcamper abre su menú de acciones',
      entonces: 'el menú queda dentro de la pantalla',
    }),
    async ({ page }) => {
      await dado('que el bootcamper tiene al menos un pago', async () => {
        await page.goto('/payments')
        await expect(page.getByTestId('payment-card').first()).toBeVisible()
      })

      await cuando('abre el menú de acciones del primer pago', async () => {
        await page
          .getByTestId('payment-card')
          .first()
          .getByRole('button', { name: /^Acciones del pago/ })
          .click()
      })

      const dentroDelViewport = async (menu) => {
        const caja = await menu.boundingBox()
        const ancho = page.viewportSize().width
        expect(caja.x).toBeGreaterThanOrEqual(0)
        expect(caja.x + caja.width).toBeLessThanOrEqual(ancho)
      }

      const menu = page.getByRole('button', { name: /Revisar|Editar|Ver información|Ver motivo/ }).first()

      await entonces('el menú cae completo dentro del viewport', async () => {
        // Se posiciona `fixed` a partir del botón. Sin acotar, `rect.right -
        // 176` puede caer fuera de la pantalla.
        await expect(menu).toBeVisible()
        await dentroDelViewport(menu)
      })

      await y('sigue en su sitio si la pantalla se desplaza', async () => {
        // La posición es una foto del momento de abrirlo: si no se recalcula,
        // el menú se despega y queda flotando sobre otra tarjeta. Y si en vez
        // de recalcular se cerrara, cualquier `scrollIntoView` —el que hace el
        // propio navegador al enfocar— lo haría desaparecer apenas se abre.
        await page.mouse.wheel(0, 200)
        await page.waitForTimeout(200)

        await expect(menu).toBeVisible()
        await dentroDelViewport(menu)
      })
    },
  )

  test(
    titulo({
      hst: 'CB-342',
      dado: 'un bootcamper en un teléfono',
      cuando: 'abre la ventana para subir un comprobante',
      entonces: 'la ventana entra en pantalla y el botón de subir es alcanzable',
    }),
    async ({ page }) => {
      await dado('que el bootcamper está en su panel de pagos', async () => {
        await page.goto('/payments')
        await expect(page.getByTestId('upload-button')).toBeVisible()
      })

      await cuando('abre la ventana de subida', async () => {
        await page.getByTestId('upload-button').click()
        await expect(page.getByRole('heading', { name: /Subir comprobante/ })).toBeVisible()
      })

      // A diferencia de los otros tres, este escenario ya pasaba antes de
      // CB-342: la ventana de subida era la única parte del flujo que estaba
      // bien en móvil. Queda como red, no como prueba de un arreglo.
      await entonces('la ventana y su botón entran en la pantalla', async () => {
        expect(await desborde(page)).toBeLessThanOrEqual(SIN_DESBORDE)
        await expect(page.getByTestId('upload-submit')).toBeInViewport()
      })
    },
  )
})

test.describe('Responsive · la activación de cuenta en el teléfono', () => {
  // Sin sesión: es la pantalla a la que llega alguien por un enlace de correo.
  test.use({ storageState: { cookies: [], origins: [] } })

  test(
    titulo({
      hst: 'CB-342',
      dado: 'una pantalla de las que comparten AuthLayout',
      cuando: 'se abre en un teléfono',
      entonces: 'el logo no se superpone al formulario ni la página se desborda',
    }),
    async ({ page }) => {
      // Se prueba sobre /login porque comparte AuthLayout con las 7 pantallas
      // de auth —onboarding incluida— y no necesita un token de invitación
      // fresco, que obligaría a convertir un lead y mutar estado.
      //
      // El alto va forzado a 520px: el solape aparece cuando el contenido es
      // alto respecto de la ventana, y ahí es donde el centrado empuja la
      // tarjeta por debajo del logo absoluto. Con el alto por defecto del Pixel
      // 7 (915px) el formulario de login es demasiado corto y la prueba no
      // distingue el layout arreglado del roto. 360x520 reproduce dos casos
      // reales: un teléfono chico, y cualquier Android que encoge el viewport
      // al abrir el teclado — que es justo cuando el usuario está escribiendo
      // en el formulario de activación, el más alto de las siete pantallas.
      await dado('que se abre el inicio de sesión en una ventana baja', async () => {
        await page.setViewportSize({ width: 360, height: 520 })
        await page.goto('/login')
        await expect(page.getByTestId('login-submit')).toBeVisible()
      })

      await entonces('la página no se sale del ancho de la pantalla', async () => {
        expect(await desborde(page)).toBeLessThanOrEqual(SIN_DESBORDE)
      })

      await y('el logo queda por encima del formulario, sin taparlo', async () => {
        const logo = await page.getByAltText('Coding Bootcamps ESPOL').boundingBox()
        const tarjeta = await page.locator('.max-w-md').first().boundingBox()

        expect(logo.y + logo.height).toBeLessThanOrEqual(tarjeta.y)
      })
    },
  )
})
