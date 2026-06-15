# Copilot Code Review Instructions — Boot-Tracker

Boot-Tracker es un CRM para Coding Bootcamps ESPOL (Django 5.1 + DRF + PostgreSQL + Redis/Celery + Expo SDK 54).

---

## Paso 1 — Leer el issue vinculado

Antes de revisar el código, busca en el body del PR referencias del tipo `Closes #N`, `Related to #N` o `Fixes #N`.

1. Abre ese issue de GitHub y lee:
   - Título y descripción
   - Criterios de aceptación (sección "Criterios de aceptación" o "Acceptance Criteria")
   - Checklist de tareas
   - La referencia al ticket de Linear (CB-XX) — los criterios de Linear están replicados en el issue de GitHub

2. Verifica que **cada criterio de aceptación** esté implementado en el diff.
   - Si el PR dice `Closes #N` pero hay criterios del issue que **no están en el diff** → **BLOCK**: indica cuáles faltan y recomienda cambiar a `Related to #N`.
   - Si un criterio depende de otro PR o issue separado → **INFO**: mencionarlo sin bloquear.

3. Si el PR no vincula ningún issue → **WARN**: todo PR debe referenciar un issue.

---

## Paso 2 — Aplicar reglas del proyecto

### RBAC — Obligatorio en cada endpoint [BLOCK si falta]

Toda `APIView` o `ViewSet` debe tener `permission_classes` explícito.
Sin él, cualquier usuario puede acceder a datos ajenos.

### Visibilidad por rol [BLOCK si el criterio lo exige]

Cuando los criterios de aceptación dicen "Admin ve todos" o "Vendedor solo ve los suyos":
- El queryset debe tener un branch por rol (ej. `if request.user.role == 'ADMIN': ...`)
- Un queryset con solo `filter(owner=request.user)` sin branch de admin, cuando el criterio pide que admin vea todos → BLOCK

### Lógica de negocio en services.py [WARN si está en views/serializers]

La lógica de negocio debe vivir en `services.py`, nunca dentro de `get()`, `post()`, `create()`, etc.

### Tests obligatorios [BLOCK si faltan]

Todo nuevo endpoint o función de negocio debe tener tests en `tests/`.
Tests marcados con `.skip` o `xfail` sin justificación → WARN.

### Reglas de negocio críticas [BLOCK si se violan]

- **Validación cédula ecuatoriana:** usar `validate_cedula()` en `apps/authentication/validators.py` — no duplicar la lógica
- **Umbral 10% déficit en pagos:** lógica en `apps/payments/services.py`
- **OCR de comprobantes:** siempre async en `apps/payments/tasks.py` via Celery, nunca inline en views
- **Tokens JWT en mobile:** `expo-secure-store` — nunca `AsyncStorage`

### Operaciones lentas [BLOCK si están inline en views]

Emails, OCR, notificaciones push → deben ir en `tasks.py` via Celery.
Si están inline en una view → BLOCK (causa timeout en los requests).

### Calidad de código

- `print(...)` en código de producción → WARN; usar `logging.getLogger(__name__)`
- Credentials, tokens o secrets hardcodeados → BLOCK; siempre variables de entorno
- N+1 queries: querysets en loops o serializers sin `select_related`/`prefetch_related` → WARN

---

## Paso 3 — Formato del feedback

Para cada hallazgo incluir:

- **Severidad:** BLOCK / WARN / INFO
- **Archivo:línea**
- **Qué regla o criterio viola** (citar el criterio exacto del issue cuando aplique)
- **Qué cambio específico se necesita**

> BLOCK = el PR no debe mergearse hasta que se corrija.
> WARN = se recomienda corregir antes del merge.
> INFO = observación sin bloquear.

---

## Stack de referencia

| Capa | Tecnología |
|---|---|
| Backend | Django 5.1 + DRF + djangorestframework-simplejwt |
| DB | PostgreSQL 16 |
| Queue/Cache | Redis 7 + Celery |
| Frontend | React 18 + Vite + TanStack Query v5 + Zustand |
| Mobile | Expo SDK 54 + Expo Router (file-based en `app/`) |
| Auth mobile | expo-secure-store (nunca AsyncStorage para JWT) |
| Linter | ruff (no flake8 ni black) |
