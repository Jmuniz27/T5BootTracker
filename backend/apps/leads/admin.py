"""Admin configuration."""
from django.contrib import admin

from .models import LeadAssignmentSetting

admin.site.register(LeadAssignmentSetting)
