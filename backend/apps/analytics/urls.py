"""URL configuration for analytics app."""
from django.urls import path

from .views import AnalyticsKPIView

urlpatterns = [
    path('kpis/', AnalyticsKPIView.as_view(), name='analytics-kpis'),
]
