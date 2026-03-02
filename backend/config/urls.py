"""URL configuration for boot-tracker project."""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.authentication.urls')),
    path('api/leads/', include('apps.leads.urls')),
    path('api/payments/', include('apps.payments.urls')),
    path('api/analytics/', include('apps.analytics.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
