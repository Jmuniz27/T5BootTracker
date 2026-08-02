"""URL configuration for programs app."""
from django.urls import path
from .views import (
    ProgramListCreateView,
    CohortListCreateView, CohortDetailView,
    CoordinatorListCreateView, CoordinatorDestroyView,
)

urlpatterns = [
    path('', ProgramListCreateView.as_view(), name='program-list-create'),
    path('<uuid:pk>/cohorts/', CohortListCreateView.as_view(), name='cohort-list-create'),
    path('<uuid:pk>/cohorts/<uuid:cohort_id>/', CohortDetailView.as_view(), name='cohort-detail'),
    path('<uuid:pk>/coordinators/', CoordinatorListCreateView.as_view(), name='coordinator-list-create'),
    path('<uuid:pk>/coordinators/<uuid:coord_id>/', CoordinatorDestroyView.as_view(), name='coordinator-destroy'),
]
