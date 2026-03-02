from django.urls import path
from .views import (
    LoginView,
    LogoutView,
    RefreshView,
    MeView,
    PasswordRecoveryRequestView,
    PasswordResetView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('refresh/', RefreshView.as_view(), name='auth-refresh'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('password-recovery/', PasswordRecoveryRequestView.as_view(), name='auth-password-recovery'),
    path('password-reset/', PasswordResetView.as_view(), name='auth-password-reset'),
]
