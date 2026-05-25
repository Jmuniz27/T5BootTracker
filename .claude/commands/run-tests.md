# /run-tests

Corre los tests del módulo activo en Boot-Tracker.

Si el usuario no especifica módulo, pregunta cuál:
- `auth` → `docker-compose exec backend pytest apps/authentication/tests/ -v`
- `leads` → `docker-compose exec backend pytest apps/leads/tests/ -v`
- `payments` → `docker-compose exec backend pytest apps/payments/tests/ -v`
- `analytics` → `docker-compose exec backend pytest apps/analytics/tests/ -v`
- `all` → `docker-compose exec backend pytest --cov=apps --cov-report=term-missing`
- `frontend` → `cd frontend && npm run test`
- `mobile` → `cd mobile && npx jest`

Después de correr, reporta:
- Cuántos tests pasaron / fallaron
- Cobertura del módulo (si es backend)
- Si hay algún test rojo, muestra el error y sugiere qué revisar
