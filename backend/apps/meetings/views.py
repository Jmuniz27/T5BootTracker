from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
from icalendar import Calendar, Event

from .serializers import CalendarEventSerializer

class GenerateICSView(APIView):
    """
    POST /api/meetings/calendar/generate-ics/
    Genera y devuelve un archivo .ics descargable.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CalendarEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Inicializar el calendario
        cal = Calendar()
        cal.add('prodid', '-//BootTracker//boottracker.com//')
        cal.add('version', '2.0')

        # Crear el evento
        event = Event()
        event.add('summary', data['summary'])

        if data.get('description'):
            event.add('description', data['description'])

        event.add('dtstart', data['start_time'])
        event.add('dtend', data['end_time'])
        event.add('dtstamp', data['start_time'])

        for attendee in data.get('attendees', []):
            event.add('attendee', f'MAILTO:{attendee}')

        cal.add_component(event)

        # Retornar como archivo binario (.ics)
        response = HttpResponse(cal.to_ical(), content_type='text/calendar')
        response['Content-Disposition'] = 'attachment; filename="evento.ics"'

        return response
