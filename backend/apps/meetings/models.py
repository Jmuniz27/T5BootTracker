from django.db import models
from apps.leads.models import Lead
from apps.authentication.models import CustomUser

class Meeting(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()

    # Relaciones
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='meetings')
    assigned_to = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, blank=True)

    # ID de Google Calendar para sincronización
    google_event_id = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} - {self.lead.email}"
