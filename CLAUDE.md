# CLAUDE.md — Boot-Tracker

> Guía de contexto para Claude Code. Lee este archivo completo antes de cualquier tarea.
> Última actualización: 25 mayo 2026 — basado en diagnóstico real del repo.

---

## Qué es este proyecto

**Boot-Tracker** es un CRM para Coding Bootcamps ESPOL. Gestiona el ciclo completo:
captación de leads → seguimiento comercial → conversión a bootcamper → pagos → analíticas.

- **Cliente / directora:** PhD. Carmen Vaca (cvaca@espol.edu.ec)
- **Entrega parcial:** 15 junio 2026 — sistema funcional end-to-end (login → leads → interacciones)
- **Entrega final:** ~17 agosto 2026 — producción + docs + handoff

---

## Estado real del proyecto (25 mayo 2026)

| Área | Estado | Detalle |
|---|---|---|
| Backend Django | ✅ ~80% listo | Auth, Leads, Payments, Conversions, Notifications OK. Analytics vacío. Calendar pendiente. |
| Frontend React | ❌ Placeholder | Solo `<h1>Boot-Tracker</h1>`. Dependencias instaladas, cero pantallas. |
| Mobile Expo | ❌ Sin código | Solo config files. No existe `mobile/app/`. Cero screens. |
| DevOps | ⚠️ Parcial | CI/CD funciona. Deploy a producción pendiente (#26). |
| Tests | ✅ Backend | 69 tests en backend. Frontend y mobile: cero. |

---

## Equipo y responsabilidades

| Persona | Área principal | Issues asignados |
|---|---|---|
| **Juan Munizaga** | Orquestación, DevOps, infra, revisiones | #6, #12, #26 + revisión de PRs |
| **JL Chong** | Backend core — nuevos endpoints y fixes | #25, #27 |
| **Zahid Díaz** | Integraciones — Google Calendar, Analytics API | #19, #20 |
| **Gabriela Jiménez** | Frontend web — UI/UX lead, vistas principales | #9, #10, #16, #22, #29 |
| **Annabella Sánchez** | Frontend web — formularios, pagos, admin | #4, #17, #23, #28 |
| **Isabella Martín** | Mobile Expo — todas las screens | #5, #11, #18, #24, #30 |

### Regla de PRs
- Todo PR necesita: CI verde + 1 aprobación
- Backend PR → Juan revisa
- Frontend PR → Gabriela revisa el de Annabella y viceversa
- Mobile PR → Juan revisa
- No escribir co-author credits de herramientas en commits

---

## Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| Backend API | Django 5.1 + DRF | Ya funcionando. Settings en `backend/config/`. |
| Base de datos | PostgreSQL 16 | Docker Compose local. |
| Cache / colas | Redis 7 + Celery | Jobs de email y OCR. Ya configurado. |
| Frontend web | React 18 + Vite | `frontend/src/` — arrancar desde cero en Sprint A. |
| UI components | shadcn/ui + Tailwind CSS | Ya en package.json, sin usar aún. |
| Estado global | Zustand | Ya instalado. No usar Redux. |
| Fetching | TanStack Query v5 | Ya instalado. No usar useEffect para datos remotos. |
| Formularios | React Hook Form + Zod | Ya instalado. |
| Mobile | Expo SDK 52 + Expo Router | `mobile/` — crear estructura `app/` en Sprint A. |
| Auth tokens mobile | expo-secure-store | NUNCA AsyncStorage para JWT. |
| Auth | JWT — djangorestframework-simplejwt | 2h expiración + refresh. Ya implementado. |
| Storage archivos | MinIO (local) → S3 (prod) | Recibos de pago. Ya configurado en backend. |
| Emails | Resend via Celery | Ya configurado. |
| Docs API | drf-spectacular + Swagger | Disponible en `/api/schema/swagger-ui/`. |

---

## Sprints (desde 25 mayo 2026)

### Sprint A — 26 may → 8 jun
**Objetivo:** primer flujo funcional end-to-end antes de la entrega del 15 jun.

| # Issue | Qué | Quién |
|---|---|---|
| #19 | Google Calendar API — OAuth + sync eventos | Zahid |
| #20 | Analytics API — KPIs básicos (conversión, tiempo medio) | Zahid |
| #4 | Frontend: pantalla Login + JWT storage + rutas por rol | Annabella |
| #9 | Frontend: Dashboard de leads (cards mis leads + disponibles) | Gabriela |
| #5 | Mobile: crear `app/`, expo-router, pantalla Login | Isabella |
| #11 | Mobile: lista de leads con pull-to-refresh | Isabella |

### Sprint B — 9 jun → 22 jun
**Objetivo:** flujos principales completos post-entrega parcial.

| # Issue | Qué | Quién |
|---|---|---|
| #25 | User Management API (CRUD usuarios + validar cédula EC) | JL Chong |
| #10 | Frontend: detalle de lead — historial, log interacción, cambio estado | Gabriela |
| #16 | Frontend: UI conversión lead → bootcamper | Annabella |
| #18 | Mobile: log post-llamada con voice-to-text | Isabella |
| #24 | Mobile: Calendar sync + push notifications | Isabella |

### Sprint C — 23 jun → 6 jul
**Objetivo:** pagos, analytics visual, staging deploy.

| # Issue | Qué | Quién |
|---|---|---|
| #17 | Frontend: panel pagos + preview OCR + validar/rechazar | Annabella |
| #22 | Frontend: dashboard analytics con charts y KPIs | Gabriela |
| #26 | DevOps: deploy staging Railway/Render + CI/CD completo | Juan |
| Mobile polish | Offline cache React Query, UX, build preview | Isabella |

### Sprint D — 7 jul → 20 jul
**Objetivo:** funciones admin completas.

| # Issue | Qué | Quién |
|---|---|---|
| Audit log API | Quién hizo qué y cuándo, buscable | JL Chong |
| #23 | Frontend: reportes exportables PDF/Excel con filtros | Annabella |
| #28 | Frontend: User Management UI (admin only) | Gabriela |
| #27 | Tests de integración E2E | JL Chong |

### Sprint E — 21 jul → 3 ago
**Objetivo:** calidad y hardening.

| Qué | Quién |
|---|---|
| Tests E2E, 50 usuarios concurrentes, <500ms, OWASP básico | JL Chong + Juan |
| Bug fixing, cross-browser, WCAG 2.1 AA básico | Gabriela + Annabella |
| Device testing iOS + Android real, UAT con cliente | Isabella |

### Sprint F — 4 ago → 17 ago
**Objetivo:** deploy final + documentación + handoff.

| # Issue | Qué | Quién |
|---|---|---|
| Producción | Zero-downtime, monitoring, backups | Juan |
| Docs | Manual vendedor, bootcamper, admin. Videos. | Todos |
| #29 | Demo final + ensayo con cliente | Todos |
| #30 | Mobile: iOS + Android build final (EAS) | Isabella |

---

## Comandos esenciales

```bash
# Levantar todo el entorno local
docker-compose up

# Aplicar migraciones
docker-compose exec backend python manage.py migrate

# Crear superusuario
docker-compose exec backend python manage.py createsuperuser

# Ver docs de la API (Swagger)
open http://localhost:8000/api/schema/swagger-ui/

# Correr todos los tests del backend
docker-compose exec backend pytest --cov=apps --cov-report=term-missing

# Correr tests de un módulo específico
docker-compose exec backend pytest apps/leads/tests/ -v

# Frontend dev
cd frontend && npm run dev

# Mobile
cd mobile && npx expo start

# Lint (backend)
cd backend && ruff check . && ruff format --check .
```

---

## Convenciones de código

### Git
- Ramas: `feat/<numero-issue>-descripcion-corta`
  - Ejemplo: `feat/9-lead-dashboard`, `feat/5-expo-setup`
- Commits: `feat(leads): add self-assignment endpoint` — sin mencionar herramientas de IA
- PRs: título claro + número de issue + descripción de qué hace y cómo probar

### Django / Python
- Linter: **ruff** (ya configurado — no usar flake8 ni black por separado)
- Lógica de negocio SIEMPRE en `services.py`, nunca en views ni serializers
- Tests con pytest + factory_boy. Un archivo `tests/` por app.
- Logging: `logger = logging.getLogger(__name__)` — nunca `print()` en código no-debug

### React / Frontend
- Fetching: **TanStack Query** (`useQuery`, `useMutation`) — nunca `useEffect` + `fetch` directo
- Estado global: **Zustand** — nunca Context para estado de aplicación
- Formularios: **React Hook Form** + validación Zod
- Componentes shadcn/ui: usar sin modificar el archivo original — crear wrappers en `components/`
- Archivos: componentes en PascalCase, hooks `use-nombre.ts`, servicios `nombre.service.ts`
- API calls: todos en `src/api/` agrupados por módulo (`auth.api.ts`, `leads.api.ts`, etc.)

### Mobile (Expo)
- Navegación: Expo Router (file-based en `app/`)
- JWT: **expo-secure-store** — NUNCA AsyncStorage
- Offline: React Query `staleTime` + `gcTime` — no implementar modo offline completo
- Notificaciones: Expo Notifications

---

## Estructura del proyecto

```
boot-tracker/
├── CLAUDE.md                    ← este archivo
├── .claude/
│   ├── settings.json
│   └── commands/
│       ├── sprint-status.md
│       ├── new-issue.md
│       └── run-tests.md
├── docker-compose.yml
├── .github/workflows/
│   └── ci.yml                   ← ya funciona
├── backend/
│   ├── config/                  ← settings base/dev/prod
│   ├── apps/
│   │   ├── authentication/      ← ✅ completo
│   │   ├── leads/               ← ✅ completo
│   │   ├── payments/            ← ✅ completo
│   │   ├── programs/            ← ✅ completo
│   │   ├── notifications/       ← ✅ completo
│   │   └── analytics/           ← ❌ stub vacío — Sprint A/B
│   └── requirements/
├── frontend/
│   └── src/
│       ├── api/                 ← clientes Axios por módulo
│       ├── components/          ← shadcn/ui wrappers + propios
│       ├── pages/               ← vistas por rol
│       ├── hooks/               ← custom hooks de dominio
│       └── store/               ← Zustand stores
└── mobile/
    └── app/                     ← crear en Sprint A con Expo Router
```

---

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

```env
SECRET_KEY=cambiar-en-produccion
DEBUG=True
DATABASE_URL=postgresql://boottracker:boottracker@db:5432/boottracker
REDIS_URL=redis://redis:6379/0
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
RESEND_API_KEY=
VITE_API_BASE_URL=http://localhost:8000/api
```

---

## Lo que NO hacer

- `print()` en código → usar `logging.getLogger(__name__)`
- Lógica en views/serializers → va en `services.py`
- `useEffect` para fetching → usar TanStack Query
- `AsyncStorage` para tokens → usar `expo-secure-store`
- Modificar archivos shadcn/ui directamente → crear wrappers
- Hardcodear credenciales → siempre `.env`
- Mencionar herramientas de IA en commits
