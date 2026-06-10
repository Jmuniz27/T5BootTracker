# Boot-Tracker

Sistema de seguimiento de leads y pagos para bootcamps de programación (ESPOL).
Gestiona el proceso desde la captación de candidatos hasta el cobro de cuotas,
con notificaciones automáticas y reportes analíticos.

- **Cliente:** PhD. Carmen Vaca (cvaca@espol.edu.ec)
- **Entrega parcial:** 15 jun 2026 — flujo end-to-end (login → leads → interacciones)
- **Entrega final:** 17 ago 2026 — producción + docs + handoff

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Django 5.1.6 + Django REST Framework 3.15.2 |
| Autenticación | JWT (djangorestframework-simplejwt 5.3.1) |
| Base de datos | PostgreSQL 16 |
| Cache / Queue | Redis 7 + Celery 5.4.0 |
| Frontend | React 18 + Vite + TanStack Query v5 + Tailwind |
| Mobile | Expo SDK 54 + Expo Router (file-based) |
| Contenedores | Docker + Docker Compose |
| Docs API | drf-spectacular → `/api/schema/swagger-ui/` |

## Equipo

| Nombre | GitHub | Área |
|---|---|---|
| Juan Munizaga | `Jmuniz27` | Orquestación, DevOps, revisiones de backend y mobile |
| JL Chong | `Jlchong3` | Backend — nuevos endpoints |
| Zahid Díaz | `LockHurb` | Integraciones — Google Calendar, Analytics |
| Gabriela Jiménez | `gabsjimz` | Frontend — UI/UX lead, vistas principales |
| Annabella Sánchez | `manzannita` | Frontend — formularios, pagos, admin |
| Isabella Martín | `isabellaim` | Mobile Expo — todas las screens |

## Requisitos previos

- Docker >= 24
- Docker Compose >= 2.20
- Git
- Node 20 (para frontend/mobile fuera de Docker)

## Setup

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd boot-tracker

# 2. Copiar variables de entorno
cp .env.example .env
# Editar .env con tus valores locales

# 3. Levantar servicios
docker-compose up --build

# 4. Aplicar migraciones (primera vez)
docker-compose exec backend python manage.py migrate

# 5. Crear superusuario (opcional)
docker-compose exec backend python manage.py createsuperuser

# 6. Mobile (fuera de Docker)
cd mobile && npx expo start
```

## URLs de desarrollo

| Servicio | URL |
|---|---|
| API Django | http://localhost:8000/api/ |
| Django Admin | http://localhost:8000/admin/ |
| Swagger UI | http://localhost:8000/api/schema/swagger-ui/ |
| Frontend Vite | http://localhost:5173 |

## Estado del código

| Área | Estado |
|---|---|
| Backend Django | ✅ Auth, Leads, Payments, Programs, Notifications. Analytics: stub vacío. |
| Frontend React | ❌ Solo placeholder. Dependencias base instaladas, cero pantallas. |
| Mobile Expo | ⚠️ Auth screens (login, forgot-password) implementadas. App screens pendientes. |
| DevOps | ⚠️ CI verde. Deploy a producción pendiente. |

## Convenciones

### Commits

```
feat(leads): agregar filtro por estado de lead
fix(auth): corregir expiración de token JWT
docs(readme): actualizar instrucciones de setup
```

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Branches

```
main                        — producción estable
feat/<numero-issue>-slug    — nuevas funcionalidades  (ej. feat/9-lead-dashboard)
fix/<numero-issue>-slug     — corrección de bugs      (ej. fix/12-token-expiry)
chore/<descripcion>         — tareas técnicas
```

Ver [CONTRIBUTING.md](CONTRIBUTING.md) para el flujo completo de PRs.
