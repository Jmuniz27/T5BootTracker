"""URL configuration for authentication app."""
from django.urls import path

from .views import (
    LoginView,
    LogoutView,
    RefreshView,
    MeView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    OnboardingView,
    OnboardingActivateView,
)

urlpatterns = [
    path('login/',                            LoginView.as_view(),                 name='auth-login'),
    path('logout/',                           LogoutView.as_view(),                name='auth-logout'),
    path('token/refresh/',                    RefreshView.as_view(),               name='auth-token-refresh'),
    path('me/',                               MeView.as_view(),                    name='auth-me'),
    path('password-reset/',                   PasswordResetRequestView.as_view(),  name='auth-password-reset'),
    path('password-reset/confirm/',           PasswordResetConfirmView.as_view(),  name='auth-password-reset-confirm'),
    path('onboarding/<str:token>/',           OnboardingView.as_view(),            name='auth-onboarding'),
    path('onboarding/<str:token>/activate/',  OnboardingActivateView.as_view(),    name='auth-onboarding-activate'),
]
