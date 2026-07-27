"""URL configuration for leads app."""
from django.urls import path

from .views import (
    LeadListCreateView,
    LeadAssignView,
    LeadReleaseView,
    LeadAdminReassignView,
    LeadAssignmentSettingView,
    LeadDetailView,
    InteractionListCreateView,
    InteractionDetailView,
    ConvertLeadView,
    ReturningBootcamperView,
)

urlpatterns = [
    path('',                                                          LeadListCreateView.as_view(),        name='lead-list-create'),
    path('returning-bootcamper/',                                     ReturningBootcamperView.as_view(),   name='lead-returning-bootcamper'),
    path('settings/self-assignment/',                                 LeadAssignmentSettingView.as_view(), name='lead-assignment-setting'),
    path('<uuid:pk>/assign/',                                         LeadAssignView.as_view(),            name='lead-assign'),
    path('<uuid:pk>/release/',                                        LeadReleaseView.as_view(),           name='lead-release'),
    path('<uuid:pk>/admin-reassign/',                                 LeadAdminReassignView.as_view(),     name='lead-admin-reassign'),
    path('<uuid:pk>/convert/',                                        ConvertLeadView.as_view(),           name='lead-convert'),
    path('<uuid:pk>/',                                                LeadDetailView.as_view(),            name='lead-detail'),
    path('<uuid:pk>/interactions/',                                   InteractionListCreateView.as_view(), name='lead-interactions'),
    path('<uuid:pk>/interactions/<uuid:interaction_pk>/',             InteractionDetailView.as_view(),     name='lead-interaction-detail'),
]
