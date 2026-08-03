#!/usr/bin/env bash
#
# Despliegue de boot-tracker en el VPS.  Destino: /opt/boot-tracker/deploy.sh
# Dueño: deploy:deploy · Permisos: 750
#
# Lo invoca GitHub Actions por SSH. La llave está restringida en authorized_keys con
#     command="/opt/boot-tracker/deploy.sh",no-port-forwarding,no-agent-forwarding,no-pty
# así que el tag NO llega como argumento: llega en $SSH_ORIGINAL_COMMAND. Por eso se lee
# de ahí y se valida — es entrada remota y no se ejecuta sin verificar.
#
# ⚠️ En este servidor corre OTRA aplicación en producción (attendance_api/attendance_db).
#    Todo comando lleva -p y -f explícitos para que nunca pueda alcanzarla.
#    Prohibido `docker system prune -a` y `docker volume prune`.
#
# Uso manual (rollback):  /opt/boot-tracker/deploy.sh <sha-de-40-hex>

set -euo pipefail

DIR=/opt/boot-tracker
COMPOSE="$DIR/docker-compose.hetzner.yml"
PROJECT=boottracker
IMAGE_BASE=ghcr.io/jmuniz27/boot-tracker
# OJO: el repo se llama T5BootTracker, no boot-tracker (fue renombrado; la URL vieja
# redirige). El workflow pone esta label con ${{ github.repository }}, que resuelve al
# nombre real — este valor tiene que coincidir EXACTAMENTE o el prune no matchea nada
# y las imagenes viejas se acumulan.
LABEL=org.opencontainers.image.source=https://github.com/Jmuniz27/T5BootTracker

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# --- 1. Tag: de SSH_ORIGINAL_COMMAND (remoto) o de $1 (manual) --------------
TAG="${SSH_ORIGINAL_COMMAND:-${1:-latest}}"
TAG="${TAG%%[[:space:]]*}"     # por si llega con argumentos extra

if [[ ! "$TAG" =~ ^([0-9a-f]{40}|latest)$ ]]; then
    echo "ERROR: tag invalido: '${TAG}'" >&2
    echo "       Se espera un SHA de git (40 hex) o 'latest'." >&2
    exit 2
fi
export IMAGE_TAG="$TAG"
log "Desplegando tag: $IMAGE_TAG"

# --- 2. Estado de la OTRA app, ANTES ----------------------------------------
# Se compara al final. Se usa attendance_db y no attendance_api a proposito: su
# equipo redespliega la API a mano, asi que el StartedAt de la API da falsos
# positivos. La base solo se reinicia si algo la toco de verdad.
OTRA_ANTES="$(docker inspect attendance_db --format '{{.State.StartedAt}}' 2>/dev/null || echo 'ausente')"

# --- 3. Traer imagenes ------------------------------------------------------
log "Bajando imagenes de GHCR..."
docker compose -p "$PROJECT" -f "$COMPOSE" pull

# --- 4. Levantar ------------------------------------------------------------
log "Levantando servicios..."
docker compose -p "$PROJECT" -f "$COMPOSE" up -d --remove-orphans

# --- 5. Esperar a que el frontend responda ----------------------------------
log "Esperando al frontend en 127.0.0.1:8080..."
ok=0
for i in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:8080/ 2>/dev/null; then
        ok=1; log "Frontend OK tras ${i}0s"; break
    fi
    sleep 10
done
if [ "$ok" -ne 1 ]; then
    log "ERROR: el frontend no respondio en 5 minutos."
    log "Ultimos logs del backend:"
    docker compose -p "$PROJECT" -f "$COMPOSE" logs --tail 40 backend || true
    log "Para volver atras:  $0 <sha-anterior>"
    exit 1
fi

# --- 6. Limpiar imagenes viejas SOLO de este proyecto ------------------------
# Se conservan las RETENER mas recientes de cada repo, para poder hacer rollback.
#
# NO se usa `docker image prune`: sin `-a` solo borra imagenes *dangling* (sin tag),
# y las de boot-tracker SIEMPRE llevan su tag de SHA. Por eso nunca borro nada y el
# disco paso de 16% a 62% en cinco dias.
#
# Tampoco se usa `prune -a --filter label=...`: borraria de golpe todo lo que no
# este corriendo, dejando cero margen de rollback.
#
# La barrera aca es el nombre de repo EXPLICITO en el bucle: `proyectobootcamp-api`
# no es ninguno de esos dos strings, asi que es imposible que lo alcance. Ademas
# `docker rmi` se niega a borrar una imagen con un contenedor corriendo, lo que
# protege tanto a la otra app como al tag recien desplegado.
RETENER=3
log "Limpiando imagenes viejas (se conservan las $RETENER mas recientes por repo)..."
for repo in "${IMAGE_BASE}-backend" "${IMAGE_BASE}-frontend"; do
    docker images "$repo" --format '{{.CreatedAt}}\t{{.ID}}' \
        | sort -r \
        | tail -n +$((RETENER + 1)) \
        | cut -f2 \
        | xargs -r -n1 docker rmi >/dev/null 2>&1 || true
done

# --- 7. Verificar que la otra app quedo intacta ------------------------------
OTRA_DESPUES="$(docker inspect attendance_db --format '{{.State.StartedAt}}' 2>/dev/null || echo 'ausente')"
if [ "$OTRA_ANTES" != "$OTRA_DESPUES" ]; then
    log "⚠️  ATENCION: attendance_db se reinicio durante el despliegue."
    log "    antes:   $OTRA_ANTES"
    log "    despues: $OTRA_DESPUES"
    log "    Revisar con: journalctl -u docker --since '10 min ago'"
else
    log "attendance_db intacta ✅"
fi

log "Despliegue completo: $IMAGE_TAG"
docker compose -p "$PROJECT" -f "$COMPOSE" ps --format 'table {{.Name}}\t{{.Status}}'
