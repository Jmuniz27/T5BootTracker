"""
Production Django settings for ESPOL server.
"""
import os
from .base import * # noqa

DEBUG = False

# ---------------------------------------------------------------------------
# Critical secrets — NO fallback: if these env vars are missing, startup
# fails loudly rather than running with a known-insecure value in production.
# Before going public, rotate these in Coolify (see docs/audit/security-audit-2026-06-26.md).
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ['SECRET_KEY']
DATABASES['default']['PASSWORD'] = os.environ['DB_PASSWORD']  # noqa

# Pulling from Coolify Environment Variables (with safe fallbacks)
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'boottracker.taws.espol.edu.ec,localhost,127.0.0.1,backend').split(',')
CORS_ALLOWED_ORIGINS = os.environ.get('CORS_ALLOWED_ORIGINS', 'https://boottracker.taws.espol.edu.ec').split(',')
CSRF_TRUSTED_ORIGINS = os.environ.get('CSRF_TRUSTED_ORIGINS', 'https://boottracker.taws.espol.edu.ec').split(',')

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
}

# Lock down auto-generated API schema/docs to admin users only.
# In local.py the endpoint stays open for developer convenience.
SPECTACULAR_SETTINGS['SERVE_PERMISSIONS'] = [  # noqa
    'rest_framework.permissions.IsAdminUser'
]
