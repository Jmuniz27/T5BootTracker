"""URL configuration for leads app."""
from django.urls import path

from .views import (
    LeadListCreateView,
    LeadAssignView,
    LeadReleaseView,
    LeadUpdateView,
    InteractionListCreateView,
)

urlpatterns = [
    path('',                             LeadListCreateView.as_view(),      name='lead-list-create'),
    path('<uuid:pk>/assign/',            LeadAssignView.as_view(),          name='lead-assign'),
    path('<uuid:pk>/release/',           LeadReleaseView.as_view(),         name='lead-release'),
    path('<uuid:pk>/',                   LeadUpdateView.as_view(),          name='lead-update'),
    path('<uuid:pk>/interactions/',      InteractionListCreateView.as_view(), name='lead-interactions'),
]
