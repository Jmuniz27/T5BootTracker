# Product Backlog — Boot-Tracker

Fuente: `contexto_proyecto/CLAUDE_contexto.md` §10 (catálogo de historias de usuario y matriz de
trazabilidad HST → CB (Linear) → issue de GitHub). Numeración de historias según el documento final
(`Proyecto_Final_BootTracker.pdf`, 32 HST) — el catálogo original archivado en Linear (CB-5…CB-35)
usa la numeración del documento parcial, que se corrió +1 a partir de HST-023.

**Estado:** todas las 32 historias listadas a continuación fueron implementadas durante el proyecto.
El "Sprint de origen" es una estimación basada en el CB/issue de GitHub referenciado en la matriz de
trazabilidad, cruzado con las fechas reales de los milestones de GitHub (ver nota al pie).

| HST | Título | CB / issue GitHub | Sprint de origen (estimado) |
|---|---|---|---|
| HST-001 | User Authentication | CB-37, CB-39, CB-40 / #2, #4, #5 | S1 |
| HST-002 | Session Management (logout) | CB-37 / #2 | S1 |
| HST-003 | Automatic Session Expiry (2h) | CB-93 / #78 | S6 |
| HST-004 | Password Recovery | CB-50, CB-66 / #15, #34 | S3 |
| HST-005 | Lead Dashboard Visualization | CB-44 / #9 | S2 |
| HST-006 | Lead Source Channel Tracking | CB-44 / #9 | S2 |
| HST-007 | Lead Self-Assignment | CB-42 / #7 | S2 |
| HST-008 | Progressive Lead Data Completion | CB-42, CB-43 / #7, #8 | S2 |
| HST-009 | Interaction Logging + Campaign | CB-43 / #8 | S2 |
| HST-010 | Interest Level Rating | CB-45 / #10 | S2 |
| HST-011 | Follow-up Scheduling + Google Calendar | CB-54, CB-45 / #19, #10 | S2/S4 |
| HST-012 | Lead Release | CB-45, CB-42 / #10, #7 | S2 |
| HST-013 | Lead to Bootcamper Conversion | CB-48, CB-51 / #13, #16 | S3 |
| HST-014 | Coordinator Email Configuration | CB-50, CB-63 / #15, #28 | S3/S5 |
| HST-015 | Returning Bootcampers as Leads | CB-48 / #13 | S3 |
| HST-016 | Payment Receipt Upload + OCR | CB-49, CB-52 / #14, #17 | S3 |
| HST-017 | Payment Account Status (Bootcamper) | CB-52 / #17 | S3 |
| HST-018 | Payment History Viewing (Bootcamper) | CB-92 / #77 | S3 |
| HST-019 | Payment Queue + Search | CB-52 / #17 | S3 |
| HST-020 | Payment Progress Monitoring + Alerts | CB-56 / #21 | S4 |
| HST-021 | Payment Validation with OCR Data | CB-52 / #17 | S3 |
| HST-022 | Manual Coordinator Notification | CB-56, CB-52 / #21, #17 | S3/S4 |
| HST-023 | Payment Rejection with Feedback | CB-91 / #76 | S3 |
| HST-024 | Lead Analytics Dashboard | CB-55, CB-57 / #20, #22 | S4 |
| HST-025 | Lead Source Visibility | CB-57, CB-44 / #22, #9 | S2/S4 |
| HST-026 | Report Generation | CB-58 / #23 | S4 |
| HST-027 | User Account Management | CB-60, CB-63 / #25, #28 | S5 |
| HST-028 | Mobile Lead List | CB-46 / #11 | S2 |
| HST-029 | Mobile Interaction Logging | CB-53 / #18 | S3 |
| HST-030 | Quick Call Integration | CB-77 / #48 | S6 |
| HST-031 | Mobile Calendar Scheduling | CB-59 / #24 | S4 |
| HST-032 | Manual Lead Creation (CR-001) | CB-90 / #75 | S2 |

## Resumen

- **Total de historias:** 32 (HST-001 … HST-032)
- **Implementadas:** 32 / 32 (100%)
- **Cobertura por sprint:** S1 (2), S2 (10), S3 (10), S4 (5), S5 (1, comparte con S3), S6 (2)

## Nota sobre las fechas de sprint

Este backlog usa la etiqueta de sprint (S1…S7) sin fecha explícita porque el propio cronograma del
proyecto tiene una discrepancia sin resolver entre dos fuentes:

1. `contexto_proyecto/CLAUDE_contexto.md` §12 documenta S1 11–24 may … S7 6–19 ago 2026.
2. Los milestones reales de GitHub (`gh api repos/Jmuniz27/T5BootTracker/milestones`) tienen fechas
   de vencimiento (`due_on`) distintas: S4 vence 2026-07-19, S5 2026-07-26, S6 2026-08-02, S7
   2026-08-11 — más cercanas al deadline académico real.

`SCRUM_Evidence/Sprint_4/` a `Sprint_7/` adoptan las fechas de los milestones de GitHub por ser la
fuente más verificable. `SCRUM_Evidence/Sprint_1/` a `Sprint_3/` conservan fechas de marzo–abril 2026
que **no se pudieron reconciliar automáticamente** con ninguna de las dos fuentes anteriores y
requieren revisión manual del equipo antes de la entrega final — ver T-04 en
`BACKLOG_ENTREGA_FINAL.md`.
