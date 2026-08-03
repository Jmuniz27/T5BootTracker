from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet
from .finance_views import FinanceBootcampersView, FinancePortfolioView

router = DefaultRouter()
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    # Antes del router a propósito: está registrado en la raíz, así que su ruta
    # de detalle capturaría "finance" como si fuera un id de usuario.
    path('finance/', FinancePortfolioView.as_view(), name='finance-portfolio'),
    path(
        'finance/<uuid:pk>/bootcampers/',
        FinanceBootcampersView.as_view(),
        name='finance-bootcampers',
    ),
    path('', include(router.urls)),
]
