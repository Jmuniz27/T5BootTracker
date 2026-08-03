"""Permission classes for leads app.

El rol comercial está partido en dos: `SALESPERSON` capta y convierte, y
`FINANCE` hace lo mismo y además monitorea los pagos. Todo el dashboard de
leads es territorio compartido, así que las clases de aquí hablan de
"comercial" y no de un rol concreto; lo exclusivo de cobro vive en
`apps.authentication.permissions.IsFinance` / `IsFinanceOrAdmin`.
"""
from rest_framework.permissions import BasePermission
from apps.authentication.models import CustomUser

COMMERCIAL_ROLES = (CustomUser.Role.SALESPERSON, CustomUser.Role.FINANCE)


class IsCommercial(BasePermission):
    """Vendedor o Finanzas: quienes trabajan un lead de punta a punta.

    El administrador queda fuera — asignarse, liberar y convertir son actos de
    tenencia sobre un lead propio, y el admin no tiene cartera.
    """
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in COMMERCIAL_ROLES
        )


class IsAdministrator(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == CustomUser.Role.ADMINISTRATOR
        )


class IsCommercialOrAdmin(BasePermission):
    """Lectura y edición del dashboard de leads, incluido el administrador."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in (*COMMERCIAL_ROLES, CustomUser.Role.ADMINISTRATOR)
        )
