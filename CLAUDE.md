# CLAUDE.md — Boot-Tracker

**Boot-Tracker** es un CRM para Coding Bootcamps ESPOL. Gestiona el ciclo completo:
captación de leads → seguimiento comercial → conversión a bootcamper → pagos → analíticas.

- **Cliente:** PhD. Carmen Vaca (cvaca@espol.edu.ec)
- **Entrega parcial:** 15 jun 2026 — flujo end-to-end (login → leads → interacciones)
- **Entrega final:** 17 ago 2026 — producción + docs + handoff
- **Issues y sprints:** `gh issue list` o GitHub → Milestones

---

## Estado del código

| Área | Estado |
|---|---|
| Backend Django | ✅ Auth, Leads, Payments, Conversions, Notifications. Analytics: stub vacío. |
| Frontend React | ❌ Solo placeholder `<h1>`. Dependencias instaladas, cero pantallas. |
| Mobile Expo | ❌ Sin `mobile/app/`. Solo config files. |
| DevOps | ⚠️ CI verde. Deploy a producción pendiente. |

---

## Equipo

| Persona | GitHub | Área |
|---|---|---|
| Juan Munizaga | `Jmuniz27` | Orquestación, DevOps, revisiones de backend y mobile |
| JL Chong | `Jlchong3` | Backend — nuevos endpoints |
| Zahid Díaz | `LockHurb` | Integraciones — Google Calendar, Analytics |
| Gabriela Jiménez | `gabsjimz` | Frontend — UI/UX lead, vistas principales |
| Annabella Sánchez | `manzannita` | Frontend — formularios, pagos, admin |
| Isabella Martín | `isabellaim` | Mobile Expo — todas las screens |

**PRs:** CI verde + 1 aprobación. Backend/mobile → Juan revisa. Frontend → Gabriela ↔ Annabella se revisan mutuamente.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Django 5.1 + DRF + djangorestframework-simplejwt |
| Base de datos | PostgreSQL 16 (Docker) |
| Cola / cache | Redis 7 + Celery (email, OCR) |
| Frontend | React 18 + Vite + shadcn/ui + Tailwind |
| Estado | Zustand (no Redux) |
| Fetching | TanStack Query v5 (no useEffect para datos remotos) |
| Formularios | React Hook Form + Zod |
| Mobile | Expo SDK 52 + Expo Router (file-based en `app/`) |
| Auth mobile | expo-secure-store (nunca AsyncStorage para JWT) |
| Storage | MinIO local → S3 prod |
| Emails | Resend via Celery |
| Docs API | drf-spectacular → `/api/schema/swagger-ui/` |

---

## Comandos esenciales

```bash
# Entorno local completo
docker-compose up

# Migraciones
docker-compose exec backend python manage.py migrate

# Tests backend (con cobertura)
docker-compose exec backend pytest --cov=apps --cov-report=term-missing

# Tests de un módulo
docker-compose exec backend pytest apps/leads/tests/ -v

# Lint backend
docker-compose exec backend ruff check . && ruff format --check .

# Frontend dev
cd frontend && npm run dev

# Mobile
cd mobile && npx expo start
```

---

## Estructura

```
boot-tracker/
├── backend/
│   ├── config/          ← settings base/dev/prod
│   └── apps/
│       ├── authentication/
│       ├── leads/
│       ├── payments/
│       ├── programs/
│       ├── notifications/
│       └── analytics/   ← stub vacío, pendiente
├── frontend/
│   └── src/
│       ├── api/         ← clientes por módulo (auth.api.ts, leads.api.ts…)
│       ├── components/  ← wrappers shadcn/ui + propios
│       ├── pages/
│       ├── hooks/
│       └── store/       ← Zustand stores
└── mobile/
    └── app/             ← crear con Expo Router
```

---

## Convenciones

### Git
- Rama: `feat/<numero-issue>-descripcion` (ej. `feat/9-lead-dashboard`)
- Commit: `feat(leads): add self-assignment endpoint` — sin mencionar herramientas de IA
- PR: título + número de issue + cómo probar

### Django / Python
- Linter: **ruff** — no usar flake8 ni black por separado
- Lógica de negocio en `services.py` — nunca en views ni serializers
- Tests: pytest + factory_boy
- Logging: `logger = logging.getLogger(__name__)` — nunca `print()`

### React
- Fetching: `useQuery` / `useMutation` de TanStack Query
- Estado global: Zustand
- Formularios: React Hook Form + Zod
- Componentes shadcn/ui: no modificar el original — crear wrappers en `components/`
- Archivos: PascalCase para componentes, `use-nombre.ts` para hooks, `nombre.service.ts` para servicios

### Mobile
- Navegación: Expo Router (file-based)
- JWT: expo-secure-store — nunca AsyncStorage
- Notificaciones: Expo Notifications

---

## Lo que NO hacer

- `print()` → usar `logging.getLogger(__name__)`
- Lógica en views/serializers → va en `services.py`
- `useEffect` para fetching → TanStack Query
- `AsyncStorage` para tokens → expo-secure-store
- Modificar archivos shadcn/ui directamente → crear wrappers
- Hardcodear credenciales → siempre `.env`
- Mencionar herramientas de IA en commits
