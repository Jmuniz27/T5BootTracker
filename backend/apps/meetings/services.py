import uuid
import os
import logging
from google.oauth2 import service_account
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

class GoogleCalendarService:
    SCOPES = ['https://www.googleapis.com/auth/calendar']

    def __init__(self):
        creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', '/app/google-credentials.json')
        self.calendar_id = os.environ.get('GOOGLE_CALENDAR_ID', 'primary')
        self.credentials = service_account.Credentials.from_service_account_file(
            creds_path, scopes=self.SCOPES
        )
        self.service = build('calendar', 'v3', credentials=self.credentials)

    def create_event(self, summary: str, start_time, end_time, description: str = "") -> str:
        body = {
            'summary': summary,
            'description': description,
            'start': {'dateTime': start_time.isoformat(), 'timeZone': 'America/Guayaquil'},
            'end': {'dateTime': end_time.isoformat(), 'timeZone': 'America/Guayaquil'},
        }
        event = self.service.events().insert(calendarId=self.calendar_id, body=body).execute()
        return event.get('id')

    def update_event(self, event_id: str, summary: str, start_time, end_time, description: str) -> None:
        body = {
            'summary': summary,
            'description': description,
            'start': {'dateTime': start_time.isoformat(), 'timeZone': 'America/Guayaquil'},
            'end': {'dateTime': end_time.isoformat(), 'timeZone': 'America/Guayaquil'},
        }
        self.service.events().patch(calendarId=self.calendar_id, eventId=event_id, body=body).execute()

    def delete_event(self, event_id: str) -> None:
        self.service.events().delete(calendarId=self.calendar_id, eventId=event_id).execute()

    def watch_calendar(self, webhook_url):
        """Suscribe la URL al calendario para recibir notificaciones push."""
        channel_id = str(uuid.uuid4())
        body = {
            'id': channel_id,
            'type': 'web_hook',
            'address': webhook_url
        }
        try:
            response = self.service.events().watch(
                calendarId=self.calendar_id,
                body=body
            ).execute()
            return response
        except Exception as e:
            print(f"Error al suscribir webhook: {e}")
            return None
