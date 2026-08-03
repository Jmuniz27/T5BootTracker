from datetime import timedelta
from icalendar import Calendar, Event
from django.core.mail import EmailMessage
from django.utils import timezone
from django.conf import settings
from celery import shared_task
from .models import Meeting
from .services import GoogleCalendarService
import logging

logger = logging.getLogger(__name__)

@shared_task
def sync_create_meeting_to_google(meeting_id):
    try:
        meeting = Meeting.objects.get(id=meeting_id)
        cal_service = GoogleCalendarService()

        google_id = cal_service.create_event(
            summary=meeting.title,
            description=f"Lead: {meeting.lead.email}\n{meeting.description}",
            start_time=meeting.start_time,
            end_time=meeting.end_time
        )

        meeting.google_event_id = google_id
        meeting.save(update_fields=['google_event_id'])
    except Exception as e:
        logger.error(f"Error syncing meeting {meeting_id} to Google: {e}")

@shared_task
def sync_update_meeting_to_google(meeting_id):
    try:
        meeting = Meeting.objects.get(id=meeting_id)
        if meeting.google_event_id:
            cal_service = GoogleCalendarService()
            cal_service.update_event(
                event_id=meeting.google_event_id,
                summary=meeting.title,
                description=f"Lead: {meeting.lead.email}\n{meeting.description}",
                start_time=meeting.start_time,
                end_time=meeting.end_time
            )
    except Exception as e:
        logger.error(f"Error updating meeting {meeting_id} in Google: {e}")

@shared_task
def sync_delete_meeting_from_google(google_event_id):
    if not google_event_id:
        return
    try:
        cal_service = GoogleCalendarService()
        cal_service.delete_event(google_event_id)
    except Exception as e:
        logger.error(f"Error deleting event {google_event_id} from Google: {e}")

@shared_task
def send_meeting_invitation(meeting_id):
    try:
        meeting = Meeting.objects.get(id=meeting_id)
        lead_email = meeting.lead.email

        # 1. Armar el archivo ICS en memoria
        cal = Calendar()
        cal.add('prodid', '-//BootTracker//boottracker.com//')
        cal.add('version', '2.0')

        event = Event()
        event.add('summary', meeting.title)
        event.add('description', meeting.description)
        event.add('dtstart', meeting.start_time)
        event.add('dtend', meeting.end_time)
        event.add('dtstamp', meeting.created_at)
        cal.add_component(event)

        ics_content = cal.to_ical()

        # 2. Preparar el correo
        subject = f"Invitación a reunión: {meeting.title}"
        body = f"Hola,\n\nSe ha programado una reunión contigo.\n\nDetalles:\n{meeting.description}\n\nPor favor revisa el archivo adjunto para agregarlo a tu calendario."

        email = EmailMessage(
            subject=subject,
            body=body,
            to=[lead_email],
        )

        # 3. Adjuntar el binario y enviar
        email.attach('invitacion.ics', ics_content, 'text/calendar')
        email.send(fail_silently=False)

        logger.info(f"Correo de invitación enviado a {lead_email}")

    except Exception as e:
        logger.error(f"Error enviando correo de invitación para la reunión {meeting_id}: {e}")


logger = logging.getLogger(__name__)

@shared_task
def process_google_calendar_webhook():
    """Busca eventos modificados recientemente en Google y actualiza la BD."""
    try:
        service = GoogleCalendarService()
        now = timezone.now()
        ten_minutes_ago = now - timedelta(minutes=10)

        events_result = service.service.events().list(
            calendarId=service.calendar_id,
            updatedMin=ten_minutes_ago.isoformat(),
            singleEvents=True,
            showDeleted=True
        ).execute()

        events = events_result.get('items', [])

        for event in events:
            google_event_id = event['id']
            try:
                meeting = Meeting.objects.get(google_event_id=google_event_id)

                if event.get('status') == 'cancelled':
                    meeting.delete()
                    continue

                start = event['start'].get('dateTime', event['start'].get('date'))
                end = event['end'].get('dateTime', event['end'].get('date'))

                meeting.start_time = start
                meeting.end_time = end
                meeting.save()

            except Meeting.DoesNotExist:
                pass # El evento no existe en nuestra BD local

    except Exception as e:
        logger.error(f"Error procesando webhook: {e}")

@shared_task
def renew_google_calendar_subscription():
    """Tarea programada que renueva la suscripción al webhook."""
    try:
        service = GoogleCalendarService()
        webhook_url = f"{settings.WEBHOOK_DOMAIN}/api/meetings/webhook/google-calendar/"
        response = service.watch_calendar(webhook_url)

        if response:
            logger.info(f"Webhook renovado: {response.get('id')}")
    except Exception as e:
        logger.error(f"Error renovando webhook: {e}")
