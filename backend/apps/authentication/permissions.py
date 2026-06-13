"""Custom permissions for authentication app."""
from rest_framework.permissions import BasePermission
from .models import CustomUser


class IsAdmin(BasePermission):
    """Only admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == CustomUser.Role.ADMINISTRATOR


class IsSalesOrAdmin(BasePermission):
    """Sales or admin users."""
    def has_permission(self, request, view) -> bool:
        return request.user.is_authenticated and request.user.role in (
            CustomUser.Role.ADMINISTRATOR, CustomUser.Role.SALESPERSON
        )


class IsCoordinatorOrAdmin(BasePermission):
    """Coordinator or admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            CustomUser.Role.ADMINISTRATOR, CustomUser.Role.COORDINATOR
        )


class IsFinanceOrAdmin(BasePermission):
    """Finance or admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            CustomUser.Role.ADMINISTRATOR, CustomUser.Role.FINANCE
        )
