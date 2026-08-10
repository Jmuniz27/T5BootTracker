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


class IsFinance(BasePermission):
    """Sólo Finanzas.

    El admin queda fuera a propósito: asignarse y liberar bootcampers del pool
    es un acto de tomar responsabilidad de cobro, y el administrador no tiene
    cartera propia (mismo criterio que `IsCommercial` sobre el pool de leads).
    """
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == CustomUser.Role.FINANCE


class IsStaffNotCoordinator(BasePermission):
    """Cualquier rol de staff con acceso operativo, salvo Coordinador.

    Pensado para acciones que cualquiera del equipo interno puede necesitar
    hacer sobre un bootcamper (ej. corregir su cohorte, CB-347) pero que no le
    corresponden al coordinador — es un contacto informativo del programa, sin
    login propio en la mayoría de los casos (`CustomUser.Role.COORDINATOR`).
    """
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            CustomUser.Role.ADMINISTRATOR, CustomUser.Role.SALESPERSON, CustomUser.Role.FINANCE,
        )
