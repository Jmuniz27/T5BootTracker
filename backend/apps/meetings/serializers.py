from rest_framework import serializers

class CalendarEventSerializer(serializers.Serializer):
    summary = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()
    attendees = serializers.ListField(
        child=serializers.EmailField(), required=False, default=list
    )
