"""
Production Django settings — VPS Hetzner, detras del nginx del host.
"""
import logging
import os

from .base import * # noqa
from celery.schedules import crontab

DEBUG = False

# ---------------------------------------------------------------------------
# Critical secrets — NO fallback: if these env vars are missing, startup
# fails loudly rather than running with a known-insecure value in production.
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ['SECRET_KEY']
DATABASES['default']['PASSWORD'] = os.environ['DB_PASSWORD']  # noqa

# Sin fallback a proposito. El default anterior apuntaba a boottracker.taws.espol.edu.ec
# (el servidor temporal, ya dado de baja): si el .env no traia estas variables, el
# backend arrancaba y rechazaba el dominio real con DisallowedHost, un error confuso
# de diagnosticar. Es preferible que falle al arrancar, con el nombre de la variable.
ALLOWED_HOSTS = os.environ['ALLOWED_HOSTS'].split(',')
CORS_ALLOWED_ORIGINS = os.environ['CORS_ALLOWED_ORIGINS'].split(',')
CSRF_TRUSTED_ORIGINS = os.environ['CSRF_TRUSTED_ORIGINS'].split(',')

# Security settings
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = 'DENY'

# CRITICAL FIX: Tell Django to trust the HTTPS headers coming from Coolify's proxy
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Whitenoise for static files
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')  # noqa
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Logging - CRITICAL FIX: Only use console in Docker. Docker captures this automatically.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
    'loggers': {
        # Sin esto, root en WARNING se traga los logger.info() de las tareas de
        # correo, y no queda forma de confirmar por log que un envio salio.
        'apps': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Lock down auto-generated API schema/docs to admin users only.
# In local.py the endpoint stays open for developer convenience.
SPECTACULAR_SETTINGS['SERVE_PERMISSIONS'] = [  # noqa
    'rest_framework.permissions.IsAdminUser'
]


# Dominio público para el webhook de Google
WEBHOOK_DOMAIN = os.environ.get('WEBHOOK_DOMAIN', 'https://boottracker.taws.espol.edu.ec')

# Configuración de Celery Beat (Tareas programadas)
CELERY_BEAT_SCHEDULE = {
    'renovar-webhook-google-calendar': {
        'task': 'apps.meetings.tasks.renew_google_calendar_subscription',
        # Se ejecuta cada 5 días a la medianoche
        'schedule': crontab(minute=0, hour=0, day_of_month='*/5'),
    },
}
# ---------------------------------------------------------------------------
# Aviso de SMTP incompleto.
#
# El envio de correo es asincrono (Celery) y PasswordResetRequestView devuelve
# 200 siempre, por diseno anti-enumeracion. La consecuencia es que un SMTP mal
# configurado es indistinguible del exito para el usuario final: pide el reset,
# ve el mensaje de "revisa tu correo" y no llega nada.
#
# Esto avisa al arrancar. No aborta a proposito: dejar la app caida por una
# credencial de correo seria peor que operarla sin notificaciones.
# ---------------------------------------------------------------------------
if not EMAIL_HOST_USER or not EMAIL_HOST_PASSWORD:  # noqa: F405
    logging.getLogger(__name__).error(
        'EMAIL_HOST_USER/EMAIL_HOST_PASSWORD vacios: el reset de contrasena y '
        'las notificaciones fallaran en silencio. Completar en el .env.'
    )
