# Pruebas de aceptación (E2E)

Suite Playwright que verifica los flujos críticos de Boot-Tracker sobre el
sistema realmente desplegado. Cada escenario está escrito en formato
**Dado/Cuando/Entonces** y cita la HST que verifica, de modo que el reporte
sirve como evidencia de aceptación.

| Escenario | Archivo |
|---|---|
| HST-001 · Inicio de sesión | `tests/hst-001-login.spec.js` |
| HST-032 / HST-009 · Alta manual de lead + interacción | `tests/hst-032-009-lead-manual.spec.js` |
| HST-007 · Auto-asignación | `tests/hst-007-auto-asignacion.spec.js` |
| HST-013 · Conversión con validación de cédula | `tests/hst-013-conversion.spec.js` |
| HST-016 / HST-021 · Comprobante: subida, OCR y aprobación | `tests/hst-016-021-pagos.spec.js` |

## Cómo correrla

Necesita la stack completa levantada **y la base sembrada**:

```bash
# 1. Desde la raíz del repo
docker compose up -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_dev

# 2. Instalar la suite (sólo la primera vez)
cd e2e
npm ci
npx playwright install --with-deps chromium

# 3. Ejecutar
npm test              # headless
npm run test:headed   # viendo el navegador
npm run test:ui       # modo interactivo, útil para depurar
npm run report        # abre el último reporte HTML
```

Variables opcionales: `E2E_BASE_URL` (por defecto `http://localhost:5173`) y
`E2E_API_URL` (por defecto `http://localhost:8000`).

## Decisiones de diseño

**En serie, sin reintentos.** Los escenarios mutan datos compartidos del seed
(asignan, convierten, aprueban). En paralelo se pisan entre sí —el backend
responde 409 `LEAD_ALREADY_ASSIGNED`— y un reintento re-ejecuta un escenario
que ya mutó estado, fallando con un error distinto al original. La suite
tarda ~1 min en serie; la determinación vale más que ese minuto.

**Autenticación por API, no por pantalla.** `tests/global.setup.js` obtiene un
token por rol y arma el `storageState` con la forma exacta que persiste el
store de Zustand. Así, si el login se rompe falla el escenario HST-001 —que sí
pasa por la interfaz— y no los otros cuatro por arrastre. Los tokens se
regeneran en cada corrida y `.auth/` nunca se versiona.

**Selección por `data-testid`.** Los componentes no exponen roles ARIA
(`CustomSelect` es un `<button>` + `<ul>`, sin `role="combobox"`), hay dos
selects con idéntico placeholder en un mismo modal, y textos como "Nuevo lead"
existen como botón y como título. Anclar a clases de Tailwind rompería la
suite ante cualquier retoque visual. Las filas de leads se anclan en
`data-lead-phone`, la clave única y estable del seed.

**El OCR se espera contra la API.** La pantalla deja de mostrar el spinner a
los 30 s aunque el OCR no haya terminado, así que esperar sólo su desaparición
daría un falso verde. El escenario consulta `ocr-status` con `expect.poll` y
además verifica que no haya aparecido el aviso de expiración. Nunca se usan
esperas fijas.

**Datos propios por corrida.** El alta de lead genera un teléfono único fuera
del rango del seed (`0991000001-10`) para no chocar con la validación de
duplicados (CR-011). Las precondiciones de auto-asignación y conversión se
restablecen vía API en `beforeAll`, de modo que la suite pueda correrse dos
veces seguidas contra la misma base.

## El comprobante de prueba

`fixtures/comprobante-test.png` es **sintético**: datos ficticios, sin PII. El
corpus de comprobantes reales usado por los tests de OCR del backend es
local-only, nunca se versiona y se elimina antes del handover.

## Notas

- Si `hst-013` se salta con "ya fue convertido", la base arrastra estado de una
  corrida previa: recrearla con `docker compose down -v && docker compose up -d`
  seguido de `migrate` + `seed_dev`.
- Ante un fallo, el reporte HTML incluye traza, captura y video
  (`playwright-report/`). En CI se suben como artefacto junto con los logs de
  backend y Celery.
