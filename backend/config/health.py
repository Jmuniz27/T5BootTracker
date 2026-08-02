"""Endpoint de salud para healthchecks de contenedor y del balanceador."""
import logging

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

logger = logging.getLogger(__name__)


@require_GET
@never_cache
def health(request):
    """GET /health/ — comprueba que el proceso responde y que la BD contesta.

    Sin autenticación a propósito: lo consultan Docker y el proxy, que no
    tienen credenciales. Por eso no expone versiones, rutas ni configuración;
    sólo si el servicio está en pie.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except Exception:
        # El detalle va al log, no a la respuesta: un error de conexión puede
        # contener credenciales o nombres de host internos.
        logger.exception('Healthcheck: la base de datos no responde')
        return JsonResponse({'status': 'unhealthy', 'database': 'down'}, status=503)

    return JsonResponse({'status': 'healthy', 'database': 'up'})
