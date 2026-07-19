from django.urls import path
from .views import GenerateICSView

urlpatterns = [
    path('calendar/generate-ics/', GenerateICSView.as_view(), name='generate-ics'),
]
