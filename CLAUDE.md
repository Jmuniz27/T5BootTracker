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
- Commit: `feat(leads): add self-assignment endpoint` — sin mencionar herramientas de IA. IMPORTANTE, no incluir "Co-Authored-By".

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

### Linear auto-sync (`/linear-sync`)
- **Uso:** después de mergear un PR a `main`, corre `/linear-sync CB-<N>`
  (ej. `/linear-sync CB-40`). Verifica el issue antes de cerrarlo.
- **Cómo funciona:** lanza el agente `linear-sync` (modelo `claude-opus-4-8`,
  tarea de criterio). Lee el issue en Linear (criterios, sub-tareas, labels),
  resuelve el PR y el estado de CI con `python .claude/scripts/pr_context.py CB-<N>`,
  inspecciona el código y los tests del diff, y decide.
- **Matching:** el id sale del nombre de rama `<user>/cb-<N>-<slug>` → `CB-<N>`.
  Si el argumento no es `CB-<N>`, no toca Linear. **Sólo modifica ese issue.**
- **La barra:** Done = todos los criterios de aceptación implementados + tests
  presentes y **no-skippeados** + **build verde**. Si falta algo → **In Review**
  con la lista de faltantes (por requisito). **Build rojo → no se toca el estado**
  ("Build is failing — fix CI before this can be closed").
- **Trigger:** sólo por slash command (no hay hook automático — política de costo).
- **Credenciales:** la sync usa el **Linear MCP** ya autenticado; no se necesita
  token. Opcional `LINEAR_API_TOKEN` para el fallback REST del script
  (`.env.example`). Nunca hardcodear tokens.

---

## Convención de PRs (1 issue = 1 PR)

Cada issue de GitHub debe tener exactamente un PR asociado.

### Reglas
- El body del PR DEBE incluir `Closes #N` (N = número de issue en GitHub)
- Nombre de rama: `<type>/<CB-XX>-short-description` (ej. `feat/CB-44-leads-dashboard`)
- El título del PR debe referenciar el título del issue

### Asignación de revisores
| Escenario | PR Author | Reviewer | Quién mergea |
|---|---|---|---|
| Codeas tu propio issue | Assignee del issue | Cualquier compañero (preferir experto del dominio) | Reviewer tras aprobar |
| Codeas el issue de otro | Quien codea | Assignee del issue (revisa su propia spec) | Assignee tras aprobar |

### Ejemplo real: CB-56 (S4-3 Monitoreo pagos)
Issue asignado a: JL Chong — Codeado por: Juan Munizaga
→ Juan abre PR con `Closes #21` → Asigna a Zahid como reviewer → Zahid revisa y mergea

### Labels en PRs
- `feature` — nueva funcionalidad
- `fix` — bug fix
- `devops` — infra/CI
- `docs` — solo documentación
- `test` — solo tests

---

## Lo que NO hacer

- `print()` → usar `logging.getLogger(__name__)`
- Lógica en views/serializers → va en `services.py`
- `useEffect` para fetching → TanStack Query
- `AsyncStorage` para tokens → expo-secure-store
- Modificar archivos shadcn/ui directamente → crear wrappers
- Hardcodear credenciales → siempre `.env`
- Mencionar herramientas de IA en commits

---

## Reglas de Negocio Críticas

Estas reglas no se pueden romper. Si una PR las viola, Claude la rechaza automáticamente.

| Regla | Dónde vive | Consecuencia de violarla |
|---|---|---|
| Validación de cédula ecuatoriana | `backend/apps/authentication/validators.py` → `validate_cedula()` | Datos inválidos en DB, problema legal |
| Umbral 10% déficit en pagos | `backend/apps/payments/services.py` | No se dispara la alerta al coordinador |
| RBAC obligatorio en cada endpoint | Todo `APIView`/`ViewSet` debe declarar `permission_classes` | Cualquier usuario accede a datos ajenos |
| OCR de comprobantes es async | `backend/apps/payments/tasks.py` via Celery — nunca inline en views | Timeout en requests, mala UX |
| No push directo a `main` | Todas las modificaciones van por PR | Se saltea CI + revisión de Claude |

### Flujo Git obligatorio

```
feature branch → PR targeting main → CI verde + Claude review aprueba → merge
```

- Claude puede **rechazar** un PR y debe comentar razones específicas con `file:line`
- Claude aprueba con `gh pr review --approve` solo si CI pasa y no hay BLOCK issues
- No se requiere aprobación humana si Claude aprueba y CI es verde

### Secrets y configuración

Nunca hardcodear. Siempre usar variables de entorno del `.env` (local) o los secrets de GitHub Actions (CI/prod).
Variables requeridas: ver `.env.example` en la raíz del repo.
