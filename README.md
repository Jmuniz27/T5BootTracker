# Boot-Tracker

Sistema de seguimiento de leads y pagos para bootcamps de programación. Gestiona el proceso desde la captación de candidatos hasta el cobro de cuotas, con notificaciones automáticas y reportes analíticos.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Django 5.1.6 + Django REST Framework 3.15.2 |
| Autenticación | JWT (djangorestframework-simplejwt 5.3.1) |
| Base de datos | PostgreSQL 16 |
| Cache / Queue | Redis 7 + Celery 5.4.0 |
| Frontend | React + Vite (Node 20) |
| Contenedores | Docker + Docker Compose |

## Equipo

| Nombre | Rol |
|---|---|
| Integrante 1 | Tech Lead / Backend |
| Integrante 2 | Backend |
| Integrante 3 | Frontend |
| Integrante 4 | Frontend |
| Integrante 5 | DevOps / QA |
| Integrante 6 | Diseño / UX |

## Requisitos previos

- Docker >= 24
- Docker Compose >= 2.20
- Git

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
docker-compose run backend python manage.py migrate

# 5. Crear superusuario (opcional)
docker-compose run backend python manage.py createsuperuser
```

## URLs de desarrollo

| Servicio | URL |
|---|---|
| API Django | http://localhost:8000/api/ |
| Django Admin | http://localhost:8000/admin/ |
| Frontend Vite | http://localhost:5173 |

## Milestones

| Milestone | Descripción | Fecha |
|---|---|---|
| M1 | Configuración del entorno y arquitectura base | Semana 1 |
| M2 | Módulo de autenticación y gestión de usuarios | Semana 2-3 |
| M3 | Módulo de leads y pipeline de ventas | Semana 4-5 |
| M4 | Módulo de pagos y notificaciones | Semana 6-7 |
| M5 | Analytics, reportes y despliegue en producción | Semana 8 |

## Convenciones

### Commits

```
<tipo>(<alcance>): <descripción corta>

feat(leads): agregar filtro por estado de lead
fix(auth): corregir expiración de token JWT
docs(readme): actualizar instrucciones de setup
```

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Branches

```
main          — producción estable
develop       — integración continua
feature/<nombre>   — nuevas funcionalidades
fix/<nombre>       — corrección de bugs
```
