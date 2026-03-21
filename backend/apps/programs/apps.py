"""App config for programs."""
from django.apps import AppConfig


class ProgramsConfig(AppConfig):
    name = 'apps.programs'
    default_auto_field = 'django.db.models.BigAutoField'
    verbose_name = 'Programas'
