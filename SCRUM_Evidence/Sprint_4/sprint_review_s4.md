# Sprint Review -- Sprint 4 (7 jul - 19 jul 2026 (fecha de cierre real segun milestone de GitHub))

## Sprint Goal

Integrar Google Calendar, construir el modulo de analitica y el monitoreo de pagos, y atender los primeros change requests del cliente (CR-004, CR-011) sobre auto-asignacion y deduplicacion de leads.

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
| #302 | Frontend: historial de pagos del bootcamper tabular y subida sin selector de programa | Done (2026-08-05) |
| #290 | Frontend: pantalla de pagos del bootcamper en español y tarjeta de adeudado | Done (2026-08-05) |
| #279 | Backend: endpoints de consulta, alta y actualización de leads para el bot de WhatsApp | Done (2026-08-11) |
| #278 | Backend: autenticación por secreto compartido para el bot de WhatsApp | Done (2026-08-11) |
| #277 | Backend: normalización de teléfono para cruzar leads con el identificador de WhatsApp | Done (2026-08-11) |
| #142 | S4-13 — HST-032 mod. (CR-011): Validación de leads duplicados en creación manual y carga CSV | Done (2026-08-02) |
| #141 | S4-12 — HST-007/HST-027 mod. (CR-004): Control de administrador sobre auto-asignación de leads | Done (2026-07-28) |
| #113 | S4-9 — Frontend: Mejoras UX/UI Panel de Pagos OCR | Done (2026-07-28) |
| #40 | S4-7 — DevOps: Servidor staging + email transaccional en prod | Done (2026-06-10) |
| #24 | S4-6: Mobile — Calendar sync + push notifications | Done (2026-08-02) |
| #21 | S4-3: Monitoreo y alertas de pagos | Done (2026-03-21) |
| #19 | S4-1: Google Calendar API — sync de eventos | Done (2026-07-19) |

## In Progress / Pending

| Issue | Deliverable | Status |
|-------|-------------|--------|
| #140 | S4-10 — DevOps: Configuración VPS ESPOL (Coolify) + despliegue v1 (entrega parcial) | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #72 | Integración con Meta | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #41 | S4-8 — Scrum: Sprint Review S4 + evidencia de aceptación cliente | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #22 | S4-4: Frontend — Dashboard de Analytics | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |
| #20 | S4-2 — Backend: Role permissions + access control | Open at report time (2026-08-11); carried over or descoped, see Key Decisions |

## Velocity

- Issues in milestone: 17
- Completed: 12 / 17 (71%)
- PRs merged: ver github_prs_s4.md

## Sprint Review Evidence

- Client-facing sprint review evidence: ../../Communications/Client_Communications/Sprint_4/ (pendiente de recoleccion, tarea T-03 de Jose Luis Chong)
- Internal ceremony evidence: ../../Communications/Internal_Team_Communications/Sprint_4/ (idem, pendiente T-03)

## Key Decisions

- El milestone de GitHub (due 2026-07-19) se adopta como fecha de cierre oficial del sprint, en lugar de las fechas de marzo-abril que arrastraba SCRUM_Evidence/Sprint_1-3 por error de copiado; ver nota de reconciliacion al pie de este documento.
- CB-84 (integracion con Meta / WhatsApp) se reclasifico como spike de investigacion Could Have (MoSCoW), no como feature completa de S4.
- El trabajo del bot de WhatsApp (issues 277-279) se completo y cerro en el paquete de trabajo final de S7, evidencia de que el alcance de S4 se re-ejecuto en la recta final del proyecto.

