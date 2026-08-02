from icalendar import Calendar, Event
from django.core.mail import EmailMessage
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

