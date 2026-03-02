"""Custom permissions for authentication app."""
from rest_framework.permissions import BasePermission
from .models import CustomUser


class IsAdmin(BasePermission):
    """Only admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == CustomUser.Role.ADMIN


class IsSalesOrAdmin(BasePermission):
    """Sales or admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            CustomUser.Role.ADMIN, CustomUser.Role.SALES
        ]


class IsCoordinatorOrAdmin(BasePermission):
    """Coordinator or admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            CustomUser.Role.ADMIN, CustomUser.Role.COORDINATOR
        ]


class IsFinanceOrAdmin(BasePermission):
    """Finance or admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            CustomUser.Role.ADMIN, CustomUser.Role.FINANCE
        ]
