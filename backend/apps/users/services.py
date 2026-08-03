import secrets

from rest_framework.exceptions import ValidationError

from apps.authentication.models import CustomUser

def create_user(data: dict) -> CustomUser:
    """Crea un usuario, resuelve su contraseña y asigna is_staff si es admin.

    Un coordinador puede llegar sin contraseña: es una persona de contacto que
    no entra a la aplicación. En ese caso queda con contraseña **inutilizable**
    (no vacía), así que ningún login la acierta.

    `coordinator_programs` es M2M y no se puede pasar al constructor: se aparta
    y se asigna después del primer save, cuando el usuario ya tiene pk.
    """
    password = data.pop('password', None)
    programs = data.pop('coordinator_programs', None)
    role = data.get('role')

    user = CustomUser(**data)

    if password:
        user.set_password(password)
    else:
        user.set_unusable_password()

    if role == CustomUser.Role.ADMINISTRATOR:
        user.is_staff = True

    user.save()

    if programs:
        user.coordinator_programs.set(programs)

    return user

def toggle_user_activation(user: CustomUser) -> CustomUser:
    """Invierte el estado de is_active del usuario."""
    user.is_active = not user.is_active
    user.save(update_fields=['is_active'])
    return user

def reset_user_password(user: CustomUser) -> str:
    """Genera una contraseña temporal segura, la aplica y la retorna.

    Raises:
        ValidationError: si el usuario es coordinador. Darle una contraseña le
            abriría un acceso que por diseño no debe tener.
    """
    if user.role == CustomUser.Role.COORDINATOR:
        raise ValidationError({
            'detail': 'Un coordinador no inicia sesión: no tiene contraseña que reiniciar.',
            'code': 'COORDINATOR_HAS_NO_PASSWORD',
        })

    new_password = secrets.token_urlsafe(12)
    user.set_password(new_password)
    user.save(update_fields=['password'])
    return new_password

