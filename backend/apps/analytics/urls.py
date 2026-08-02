"""URL configuration for analytics app."""
from django.urls import path

from .views import AnalyticsExportView, AnalyticsKPIView, LeadManagementMetricsView

urlpatterns = [
    path('kpis/', AnalyticsKPIView.as_view(), name='analytics-kpis'),
    path('lead-management/', LeadManagementMetricsView.as_view(), name='analytics-lead-management'),
    path('export/', AnalyticsExportView.as_view(), name='analytics-export'),
]
