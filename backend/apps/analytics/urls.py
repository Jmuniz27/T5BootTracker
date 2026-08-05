"""URL configuration for analytics app."""
from django.urls import path

from .views import AnalyticsKPIView, LeadManagementMetricsView, SalespersonLeadDetailView

urlpatterns = [
    path('kpis/', AnalyticsKPIView.as_view(), name='analytics-kpis'),
    path('lead-management/', LeadManagementMetricsView.as_view(), name='analytics-lead-management'),
    path(
        'lead-management/leads/',
        SalespersonLeadDetailView.as_view(),
        name='analytics-salesperson-leads',
    ),
]
