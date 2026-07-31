"""URL configuration for boot-tracker project."""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.authentication.urls')),
    path('api/leads/', include('apps.leads.urls')),
    path('api/payments/', include('apps.payments.urls')),
    path('api/programs/', include('apps.programs.urls')),
    path('api/users/', include('apps.users.urls')),
    path('api/analytics/', include('apps.analytics.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
    path('api/meetings/', include('apps.meetings.urls')),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]

if settings.DEBUG:
    from apps.notifications.preview import preview_email, preview_index

    # static() ya sólo aplica con DEBUG=True (en producción devuelve una lista
    # vacía); los comprobantes se sirven vía /api/payments/receipt/ con URL
    # firmada en todos los entornos.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += [
        path('dev/emails/', preview_index, name='email-preview-index'),
        path('dev/emails/<slug:name>/', preview_email, name='email-preview'),
    ]
