#!/usr/bin/env bash
# Backup diario de la base de datos de producción de Boot-Tracker.
#
# Instalación en el VPS (una sola vez):
#   sudo cp deploy/backup-postgres.sh /opt/boot-tracker/backup-postgres.sh
#   sudo chmod +x /opt/boot-tracker/backup-postgres.sh
#   crontab -e   →   30 6 * * * /opt/boot-tracker/backup-postgres.sh >> /var/log/boottracker-backup.log 2>&1
#   (06:30 UTC = 01:30 en Ecuador, fuera del horario de uso 7am-9pm del NFR de disponibilidad)
#
# Restore drill (verificar el backup, no solo crearlo):
#   gunzip -c /opt/boot-tracker/backups/boottracker-<fecha>.sql.gz \
#     | docker exec -i boottracker-db-1 psql -U "$DB_USER" -d postgres
#
# El dump usa pg_dump dentro del contenedor db, así no se necesita cliente
# de Postgres en el host. Se retienen los últimos 14 dumps; la copia
# fuera del host (rclone/scp a almacenamiento externo) queda documentada
# como paso pendiente en docs/deployment.

set -euo pipefail

COMPOSE_DIR="/opt/boot-tracker"
BACKUP_DIR="/opt/boot-tracker/backups"
RETENTION=14

# Lee DB_USER y DB_NAME del mismo .env que usa docker compose.
set -a
# shellcheck disable=SC1091
source "${COMPOSE_DIR}/.env"
set +a

mkdir -p "${BACKUP_DIR}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/boottracker-${STAMP}.sql.gz"

echo "[$(date '+%F %T')] Iniciando backup a ${OUT}"

docker exec boottracker-db-1 pg_dump -U "${DB_USER}" -d "${DB_NAME}" --no-owner \
  | gzip > "${OUT}"

# Un dump vacío o truncado es peor que ninguno: falla ruidosamente.
if [ ! -s "${OUT}" ] || [ "$(stat -c%s "${OUT}")" -lt 1024 ]; then
  echo "[$(date '+%F %T')] ERROR: dump sospechosamente pequeño, revisar" >&2
  exit 1
fi

# Backup del volumen de media (comprobantes). El prefijo del volumen es el
# project name de compose (contenedores: boottracker-db-1 → proyecto
# "boottracker"); verificar con `docker volume ls` si cambia.
MEDIA_OUT="${BACKUP_DIR}/media-${STAMP}.tar.gz"
docker run --rm -v boottracker_media_data:/media:ro alpine \
  tar czf - -C /media . > "${MEDIA_OUT}" || echo "[WARN] backup de media falló (volumen boottracker_media_data no encontrado?)"

# Retención: conserva los últimos N de cada tipo.
ls -1t "${BACKUP_DIR}"/boottracker-*.sql.gz 2>/dev/null | tail -n +$((RETENTION + 1)) | xargs -r rm -f
ls -1t "${BACKUP_DIR}"/media-*.tar.gz 2>/dev/null | tail -n +$((RETENTION + 1)) | xargs -r rm -f

echo "[$(date '+%F %T')] Backup completo: $(du -h "${OUT}" | cut -f1) (db), $(du -h "${MEDIA_OUT}" 2>/dev/null | cut -f1 || echo n/a) (media)"
