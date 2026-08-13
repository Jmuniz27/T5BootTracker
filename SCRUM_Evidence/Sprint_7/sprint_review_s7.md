# Sprint Review -- Sprint 7 (6 ago - 11 ago 2026 (fecha de cierre real segun milestone de GitHub; el deadline academico es 11 ago 2026))

## Sprint Goal

Cierre del proyecto: entrega final al cliente, acta de aceptacion, contribuciones individuales, testing de aceptacion, y la campana de responsive derivada de las pruebas de usabilidad con vendedores.

## Team

| Role | Member |
|------|--------|
| Scrum Master | Jose Chong (Jlchong3) |
| Product Owner | Juan Munizaga (Jmuniz27) |
| Backend | Juan Munizaga, Zahid Diaz, Jose Chong |
| Frontend | Gabriela Jimenez, Annabella Sanchez |
| Mobile | Isabella Martin |

## Deliverables Completed

| Issue | Deliverable | Status |
|-------|-------------|--------|
| #342 | Frontend: responsive web en el flujo de comprobante y en la activación de cuenta del bootcamper | Done (2026-08-09) |
| #337 | Backend: métricas por vendedor filtradas por rango de fechas | Done (2026-08-07) |
| #329 | Onboarding: el bootcamper debe aceptar el uso de sus datos al crear su cuenta | Done (2026-08-07) |
| #328 | Usuarios: mostrar programa y cohorte del bootcamper, y poder filtrar por ambos | Done (2026-08-07) |
| #327 | Analítica: pestaña comparativa entre vendedores | Done (2026-08-07) |
| #326 | Admin: repartir bootcampers a Finanzas en lote (checklist + seleccionar todo) | Done (2026-08-07) |
| #325 | Leads: cada interacción debe guardar el estado del lead en ese momento | Done (2026-08-07) |
| #324 | Leads: estado final para descartar un lead, con motivo obligatorio | Done (2026-08-07) |
| #323 | Frontend: mostrar desde cuándo el lead está asignado al vendedor | Done (2026-08-07) |
| #299 | Pagos: el admin habilita o deshabilita la auto-asignación de cobro | Done (2026-08-05) |
| #296 | [Sprint 7] Notificar coordinador: falta validación server-side del estado crítico + doc de verificación | Done (2026-08-05) |
| #295 | [Sprint 7] Enviar acceso por correo al crear un usuario en el panel admin | Done (2026-08-05) |
| #294 | [Sprint 7] Falta el backend para editar y reenviar un pago rechazado (404) | Done (2026-08-05) |
| #293 | [Sprint 7] Bootcamper no puede subir comprobante de pago (selector de programa vacío) | Done (2026-08-05) |
| #283 | Pagos: historial de solicitudes y que el admin pueda repartir el pool | Done (2026-08-05) |
| #270 | Conversión: elegir cohorte y descuento en el modal | Done (2026-08-03) |
| #266 | Analítica: pestañas Vista General y Vendedor, con rendimiento por persona | Done (2026-08-03) |
| #259 | Frontend: verificación de datos del bootcamper por el vendedor dueño del lead | Done (2026-08-05) |
| #258 | Mobile: leer la respuesta de conversión (hoy se descarta la contraseña sin poder recuperarla) + reenvío | Done (2026-08-05) |
| #257 | Frontend: reemplazar la contraseña de conversión por el link de invitación + reenvío | Done (2026-08-05) |
| #256 | Frontend: pantalla pública de onboarding del bootcamper | Done (2026-08-05) |
| #255 | Backend: email de invitación al bootcamper + regeneración/reenvío | Done (2026-08-05) |
| #254 | Backend: campos de perfil y estado de verificación del bootcamper | Done (2026-08-04) |
| #253 | Backend: token de invitación de un solo uso + endpoints de onboarding del bootcamper | Done (2026-08-05) |
| #252 | Backend: validador compartido de cédula y RUC ecuatorianos (persona natural, sociedad, público) | Done (2026-08-04) |
| #250 | Conversión: inscribir en una cohorte y validar que admita inscripciones | Done (2026-08-03) |
| #241 | Descuento por bootcamper: el vendedor lo elige al convertir y los pagos lo respetan | Done (2026-08-03) |
| #226 | Backend: RBAC — validar propiedad en conversión y detalle de lead | Done (2026-08-03) |
| #225 | Frontend: el admin debe poder asignar un lead sin dueño | Done (2026-08-03) |
| #224 | Frontend: pantalla de leads propia del Administrador (HST-025) | Done (2026-08-03) |
| #223 | Backend: separar la vista de leads del admin de "mis leads" (HST-025) | Done (2026-08-03) |
| #222 | Admin: ver los bootcampers asignados a cada vendedor, en solo lectura | Done (2026-08-03) |
| #217 | Cohortes: mes de fin previsto obligatorio (prerrequisito para mover las fechas del programa) | Done (2026-08-03) |
| #203 | feat(programs): pantallas de administración de programas y cohortes | Done (2026-08-03) |
| #202 | Frontend: administración de programas y cohortes para el administrador | Done (2026-08-03) |
| #201 | feat(users): coordinador con varios programas y sin credenciales | Done (2026-08-03) |
| #200 | Coordinadores: varios programas por coordinador y sin credenciales | Done (2026-08-03) |
| #199 | feat(programs): modelo de cohortes con estados y endpoints por programa | Done (2026-08-03) |
| #198 | feat(users): alcance general o por programa para coordinadores | Done (2026-08-03) |
| #197 | Coordinadores: alcance general o por programa en notificaciones | Done (2026-08-03) |
| #196 | Cohortes: modelo, estados y endpoints por programa | Done (2026-08-03) |
| #195 | feat(analytics): tarjeta de leads sin asignar en Gestión de leads | Done (2026-08-02) |
| #194 | Analytics: tarjeta de leads sin asignar en Gestión de leads | Done (2026-08-02) |
| #23 | S4-5: Frontend — Reportes exportables PDF/Excel | Done (2026-08-07) |

## In Progress / Pending

| Issue | Deliverable | Status |
|-------|-------------|--------|
| #263 | Mobile: ocultar la agenda a FINANCE (alinear con web, solo SALESPERSON) | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #262 | Frontend: higiene de rutas — guard faltante en detalle de pagos, ruta muerta /my-leads, COORDINATOR sin manejo | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #261 | Backend: last_name del bootcamper puede quedar literalmente 'N/A' | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #260 | Backend: el endpoint de conversión no valida que el lead esté QUALIFIED | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #227 | Reasignación masiva de leads (opcional, sólo si entra en S7) | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #54 | S7-6 — Mobile: Builds finales iOS/Android + entrega | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #53 | S7-5 — Docs: Contribuciones individuales + actualización documento final | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #52 | S7-4 — Frontend: Demo final web + grabación del sistema | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #51 | S7-3 — QA: Testing de aceptación final + reporte HST | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #50 | S7-2 — DevOps: Guía de despliegue + entrega final al cliente | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #49 | S7-1 — Scrum: Cierre del proyecto + acta de aceptación Dra. Vaca | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |

## Velocity

- Issues in milestone: 55
- Completed: 44 / 55 (80%)
- PRs merged: ver github_prs_s7.md

## Sprint Review Evidence

- Client-facing sprint review evidence: ../../Communications/Client_Communications/Sprint_7/ (pendiente de recoleccion, tarea T-03 de Jose Luis Chong)
- Internal ceremony evidence: ../../Communications/Internal_Team_Communications/Sprint_7/ (idem, pendiente T-03)

## Key Decisions

- El milestone de GitHub (due 2026-08-11) se adopta como fecha de cierre oficial, coincidiendo con el deadline academico documentado en 02FinalProjectSpec_en.md.
- El sprint absorbio un volumen de trabajo muy superior al planificado originalmente (55 issues rastreados en este milestone) porque concentro tanto el cierre normal de S7 como el catch-up de features de S4-S6 que se re-priorizaron sobre la marcha; ver la nota de reconciliacion.
- La campana de responsive (CB-342 y CB-352) nacio de sesiones de validacion de UX con vendedores reales y genero una suite de pruebas moviles de Playwright nueva (e2e/tests/mobile).
- El bot de WhatsApp para leads (issues 277-279, 290, 302) se completo en este sprint, siendo en origen alcance de S4 (CB-84).

