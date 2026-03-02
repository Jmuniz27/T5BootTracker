"""
Local development Django settings.
"""
from .base import *  # noqa

DEBUG = True

ALLOWED_HOSTS = ['*']

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
