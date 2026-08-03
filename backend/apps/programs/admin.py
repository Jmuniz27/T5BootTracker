"""Admin registration for programs app."""
from django.contrib import admin
from .models import Cohort, Program, CoordinatorEmailConfig

admin.site.register(Program)
admin.site.register(Cohort)
admin.site.register(CoordinatorEmailConfig)
