from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet
from .salespeople_views import SalespeoplePortfolioView, SalespersonBootcampersView

router = DefaultRouter()
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    # Antes del router a propósito: está registrado en la raíz, así que su ruta
    # de detalle capturaría "salespeople" como si fuera un id de usuario.
    path('salespeople/', SalespeoplePortfolioView.as_view(), name='salespeople-portfolio'),
    path(
        'salespeople/<uuid:pk>/bootcampers/',
        SalespersonBootcampersView.as_view(),
        name='salesperson-bootcampers',
    ),
    path('', include(router.urls)),
]
