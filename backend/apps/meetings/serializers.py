from rest_framework import serializers
from .models import Meeting

class MeetingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Meeting
        fields = ['id', 'title', 'description', 'start_time', 'end_time', 'lead', 'assigned_to', 'google_event_id', 'created_at']
        read_only_fields = ['id', 'google_event_id', 'created_at']
