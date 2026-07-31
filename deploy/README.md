# Operación en el VPS de producción

Artefactos de operación que viven (o deben vivir) en `/opt/boot-tracker/` del VPS.
Este directorio del repo es su fuente de verdad versionada.

| Archivo | Estado |
|---|---|
| `backup-postgres.sh` | Backup diario de Postgres + volumen de media. Instalar según el encabezado del script. |
| `deploy.sh` | ⚠️ **Pendiente de versionar**: hoy sólo existe en `/opt/boot-tracker/deploy.sh` del VPS. Copiarlo aquí (`scp`) en la próxima sesión con acceso SSH y mantenerlo sincronizado. Es el script que ejecuta la llave SSH restringida del pipeline (ver `.github/workflows/ci-pr.yml`). |

## Runbook mínimo

- **Deploy manual / rollback:** `ssh` al VPS y `/opt/boot-tracker/deploy.sh <sha>` con cualquier SHA de `main` ya publicado en GHCR.
- **Re-disparar el deploy desde Actions:** re-ejecutar el job "Deploy a producción" del último run verde de `main` (requiere la variable `DEPLOY_ENABLED=true`).
- **Verificar backups:** el cron escribe en `/var/log/boottracker-backup.log`; hacer un restore drill mensual (comando en el encabezado de `backup-postgres.sh`).
- **Nunca** ejecutar `docker system prune -a` ni `docker volume prune` en el host: los volúmenes `postgres_data` y `media_data` son los datos de producción y el host se comparte con otra aplicación.
