from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EnrollmentCohortView, UserViewSet
from .finance_views import FinanceBootcampersView, FinancePortfolioView
from .salespeople_views import SalespeopleActivityView, SalespersonActivityDetailView

router = DefaultRouter()
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    # Antes del router a propósito: está registrado en la raíz, así que su ruta
    # de detalle capturaría "finance" o "salespeople" como si fueran ids.
    path('finance/', FinancePortfolioView.as_view(), name='finance-portfolio'),
    path('salespeople/', SalespeopleActivityView.as_view(), name='salespeople-activity'),
    path(
        'salespeople/<uuid:pk>/activity/',
        SalespersonActivityDetailView.as_view(),
        name='salesperson-activity-detail',
    ),
    path(
        'finance/<uuid:pk>/bootcampers/',
        FinanceBootcampersView.as_view(),
        name='finance-bootcampers',
    ),
    path(
        '<uuid:pk>/enrollments/<uuid:enrollment_id>/',
        EnrollmentCohortView.as_view(),
        name='enrollment-cohort',
    ),
    path('', include(router.urls)),
]
