"""Admin registration for programs app."""
from django.contrib import admin
from .models import Program, CoordinatorEmailConfig

admin.site.register(Program)
admin.site.register(CoordinatorEmailConfig)
