import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import viewsets
from .tasks import process_google_calendar_webhook
from .models import Meeting
from .serializers import MeetingSerializer
from .permissions import IsAdminOrMeetingOwner
from .tasks import sync_create_meeting_to_google, sync_update_meeting_to_google, sync_delete_meeting_from_google, send_meeting_invitation

logger = logging.getLogger(__name__)

class MeetingViewSet(viewsets.ModelViewSet):
    serializer_class = MeetingSerializer
    permission_classes = [IsAdminOrMeetingOwner] # <--- Nuevo permiso

    def get_queryset(self):
        """Filtra la base de datos según quién está preguntando."""
        user = self.request.user

        # 1. Filtro de seguridad por Rol
        if user.is_staff: # Administrador
            queryset = Meeting.objects.all()
        else:             # Vendedor
            queryset = Meeting.objects.filter(assigned_to=user)

        # 2. Filtros de fecha y lead (Igual que antes)
        start_date = self.request.query_params.get('start')
        end_date = self.request.query_params.get('end')
        if start_date and end_date:
            queryset = queryset.filter(start_time__gte=start_date, start_time__lte=end_date)

        lead_id = self.request.query_params.get('lead_id')
        if lead_id:
            queryset = queryset.filter(lead_id=lead_id)

        return queryset.order_by('start_time')

    def perform_create(self, serializer):
        meeting = serializer.save(assigned_to=self.request.user)
        sync_create_meeting_to_google.delay(meeting.id)
        send_meeting_invitation.delay(meeting.id) # <--- Dispara el correo

    def perform_update(self, serializer):
        meeting = serializer.save()
        sync_update_meeting_to_google.delay(meeting.id)
        # Opcional: podrías crear un send_meeting_update(meeting.id) aquí

    def perform_destroy(self, instance):
        google_id = instance.google_event_id
        if google_id:
            sync_delete_meeting_from_google.delay(google_id)
        instance.delete()

class GoogleCalendarWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        resource_state = request.headers.get('X-Goog-Resource-State')

        if resource_state == 'exists':
            process_google_calendar_webhook.delay()

        return Response({"status": "ok"}, status=200)
