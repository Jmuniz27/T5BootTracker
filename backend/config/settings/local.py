"""
Local development Django settings.
"""
import os

from .base import *  # noqa

DEBUG = True

ALLOWED_HOSTS = ['*']

# ─── Profiling con django-silk ────────────────────────────────────────────────
#
# Detrás de una variable de entorno y apagado por defecto a propósito: pytest
# usa este mismo módulo (ver pytest.ini), así que cargar silk siempre metería su
# middleware y sus escrituras en las 286 pruebas de la suite. Para perfilar:
#
#   SILK_ENABLED=True docker compose up backend
#   docker compose exec backend python manage.py migrate   # crea sus tablas
#
# Elegido sobre Django Debug Toolbar porque el backend es una API DRF: la
# Toolbar inyecta un panel HTML que no tiene equivalente en una respuesta JSON,
# mientras que silk perfila a nivel middleware y guarda historial consultable.
SILK_ENABLED = os.environ.get('SILK_ENABLED', 'False').lower() in ('true', '1', 'yes')

if SILK_ENABLED:
    INSTALLED_APPS = INSTALLED_APPS + ['silk']  # noqa: F405
    # Va primero para medir el tiempo total del request, incluido el que
    # consumen los middlewares que siguen.
    MIDDLEWARE = ['silk.middleware.SilkyMiddleware'] + MIDDLEWARE  # noqa: F405

    # El dashboard queda detrás de login y restringido a staff: expone cuerpos
    # de requests y respuestas, que incluyen datos personales y tokens.
    SILKY_AUTHENTICATION = True
    SILKY_AUTHORISATION = True
    SILKY_PERMISSIONS = lambda user: user.is_staff  # noqa: E731

    # Guardar el detalle de cada consulta es lo que permite ver los patrones N+1.
    SILKY_ANALYZE_QUERIES = True
    SILKY_MAX_REQUEST_BODY_SIZE = 1024
    SILKY_MAX_RESPONSE_BODY_SIZE = 1024

# Use console email backend for development
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Relaxed CORS for local development
CORS_ALLOW_ALL_ORIGINS = True

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'DEBUG',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
