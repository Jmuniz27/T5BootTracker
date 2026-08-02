from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MeetingViewSet

router = DefaultRouter()
# Esto genera automáticamente las rutas:
# GET/POST /api/meetings/events/
# GET/PATCH/DELETE /api/meetings/events/{id}/
router.register(r'events', MeetingViewSet, basename='meeting')

urlpatterns = [
    path('', include(router.urls)),
]
