"""Permission classes for leads app."""
from rest_framework.permissions import BasePermission
from apps.authentication.models import CustomUser


class IsSalesperson(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == CustomUser.Role.SALESPERSON
        )


class IsAdministrator(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == CustomUser.Role.ADMINISTRATOR
        )


class IsSalespersonOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (CustomUser.Role.SALESPERSON, CustomUser.Role.ADMINISTRATOR)
        )
