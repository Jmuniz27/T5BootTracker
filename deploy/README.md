# Operación en el VPS de producción

Artefactos de operación que viven (o deben vivir) en `/opt/boot-tracker/` del VPS.
Este directorio del repo es su fuente de verdad versionada.

| Archivo | Estado |
|---|---|
| `backup-postgres.sh` | Backup diario de Postgres + volumen de media. Instalar según el encabezado del script. |
| `deploy.sh` | ✅ Versionado. Es el script que ejecuta la llave SSH restringida del pipeline (ver `.github/workflows/ci-pr.yml`). Copia idéntica de `/opt/boot-tracker/deploy.sh`. |
| `.env.prod.example` | Plantilla del `.env` de producción. Los valores reales sólo viven en el servidor, en `/opt/boot-tracker/.env` (600, dueño `deploy`). |

> **Al editar `deploy.sh` hay que copiarlo al servidor a mano** — no lo despliega el
> pipeline. `scp deploy/deploy.sh root@<vps>:/opt/boot-tracker/deploy.sh` y después
> `chown deploy:deploy` + `chmod 750`. Si divergen, manda el del servidor.

## Limpieza de imágenes

`deploy.sh` conserva las **3 imágenes más recientes** de cada repo (`RETENER=3`) y borra
el resto en cada despliegue. Eso deja margen para hacer rollback a dos versiones atrás.

Antes usaba `docker image prune -f --filter label=…`, que **no borraba nada**: sin `-a`
sólo elimina imágenes *dangling*, y las de boot-tracker siempre llevan su tag de SHA.
El disco pasó del 16 % al 62 % en cinco días hasta que se detectó.

La barrera contra la otra aplicación del host es el **nombre de repo explícito** en el
bucle: `proyectobootcamp-api` no coincide con ninguno de los dos, así que es imposible
que lo alcance. Nunca reemplazar eso por un `prune -a` global.

## Runbook mínimo

- **Deploy manual / rollback:** `ssh` al VPS y `/opt/boot-tracker/deploy.sh <sha>` con cualquier SHA de `main` ya publicado en GHCR.
- **Re-disparar el deploy desde Actions:** re-ejecutar el job "Deploy a producción" del último run verde de `main` (requiere la variable `DEPLOY_ENABLED=true`).
- **Verificar backups:** el cron escribe en `/var/log/boottracker-backup.log`; hacer un restore drill mensual (comando en el encabezado de `backup-postgres.sh`).
- **Nunca** ejecutar `docker system prune -a` ni `docker volume prune` en el host: los volúmenes `postgres_data` y `media_data` son los datos de producción y el host se comparte con otra aplicación.
