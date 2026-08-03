from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet
from .finance_views import FinanceBootcampersView, FinancePortfolioView
from .salespeople_views import SalespeoplePortfolioView, SalespersonBootcampersView

router = DefaultRouter()
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    # Antes del router a propósito: está registrado en la raíz, así que su ruta
    # de detalle capturaría "finance" o "salespeople" como si fueran un id.
    path('finance/', FinancePortfolioView.as_view(), name='finance-portfolio'),
    path(
        'finance/<uuid:pk>/bootcampers/',
        FinanceBootcampersView.as_view(),
        name='finance-bootcampers',
    ),
    path('salespeople/', SalespeoplePortfolioView.as_view(), name='salespeople-portfolio'),
    path(
        'salespeople/<uuid:pk>/bootcampers/',
        SalespersonBootcampersView.as_view(),
        name='salesperson-bootcampers',
    ),
    path('', include(router.urls)),
]
