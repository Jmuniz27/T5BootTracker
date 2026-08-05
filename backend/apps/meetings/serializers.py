from rest_framework import serializers
from .models import Meeting

class MeetingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Meeting
        fields = ['id', 'title', 'description', 'start_time', 'end_time', 'lead', 'assigned_to', 'google_event_id', 'created_at']
        read_only_fields = ['id', 'google_event_id', 'created_at']

    def validate(self, attrs):
        start_time = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end_time = attrs.get('end_time', getattr(self.instance, 'end_time', None))

        if start_time and end_time and start_time >= end_time:
            raise serializers.ValidationError({
                "end_time": "La fecha y hora de fin debe ser posterior al inicio."
            })

        return attrs
