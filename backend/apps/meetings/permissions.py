from rest_framework import permissions

class IsAdminOrMeetingOwner(permissions.BasePermission):
    """
    Permite acceso total a los Administradores.
    Los Vendedores solo pueden acceder si ellos son los dueños (assigned_to) del evento.
    """
    def has_permission(self, request, view):
        # Primero, asegurarse de que está autenticado
        if not request.user.is_authenticated:
            return False

        # Aquí defines cómo identificas a tu admin o salesperson.
        # Ejemplo: asumiendo que los admins tienen is_staff=True.
        # Ajusta "request.user.role == 'SALESPERSON'" según cómo esté en tu modelo CustomUser.
        is_admin = request.user.is_staff
        is_salesperson = getattr(request.user, 'role', '') == 'SALESPERSON' or request.user.groups.filter(name='Salesperson').exists()

        return is_admin or is_salesperson

    def has_object_permission(self, request, view, obj):
        # Los administradores pueden hacer lo que quieran
        if request.user.is_staff:
            return True

        # Los vendedores solo pueden tocar el objeto si es suyo
        return obj.assigned_to == request.user
