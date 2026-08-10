/**
 * Medidas de ventana que sólo tienen sentido en un navegador real.
 *
 * jsdom no tiene motor de layout: no resuelve media queries, `display: none` no
 * se computa y `getBoundingClientRect` devuelve ceros. Todo lo que se puede
 * afirmar allá son clases; acá se miden desbordes y posiciones de verdad.
 */

/** Cuánto se sale el documento del ancho de la ventana. 0 = no se sale. */
export const desborde = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

// Un píxel de tolerancia: los redondeos subpíxel de Chromium al escalar dan
// diferencias de <1px que no son un desborde real.
export const SIN_DESBORDE = 1

/**
 * El fondo del elemento raíz, que es el que el navegador propaga al lienzo: el
 * área que queda al descubierto cuando el scroll rebota más allá del contenido.
 * Un fondo puesto en un div anidado no llega ahí.
 */
export const fondoDelLienzo = (page) =>
  page.evaluate(() => {
    const estilo = getComputedStyle(document.documentElement)
    return { color: estilo.backgroundColor, imagen: estilo.backgroundImage }
  })

/** Lo que se veía antes del arreglo: el blanco por defecto, o nada. */
export const SIN_FONDO = ['rgba(0, 0, 0, 0)', 'transparent', 'rgb(255, 255, 255)']
