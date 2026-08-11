from rest_framework import serializers
from .models import Meeting

class MeetingSerializer(serializers.ModelSerializer):
    # Nombre del responsable de la reunión: lo usa la agenda global del admin
    # para mostrar de quién es cada reunión.
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            'id', 'title', 'description', 'start_time', 'end_time', 'lead',
            'assigned_to', 'assigned_to_name', 'google_event_id', 'created_at',
        ]
        read_only_fields = ['id', 'google_event_id', 'created_at']

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.get_full_name() if obj.assigned_to else None
