import secrets
from apps.authentication.models import CustomUser

def create_user(data: dict) -> CustomUser:
    """Crea un usuario, hashea la contraseña y asigna is_staff si es admin."""
    password = data.pop('password')
    role = data.get('role')

    user = CustomUser(**data)
    user.set_password(password)

    if role == CustomUser.Role.ADMINISTRATOR:
        user.is_staff = True

    user.save()
    return user

def toggle_user_activation(user: CustomUser) -> CustomUser:
    """Invierte el estado de is_active del usuario."""
    user.is_active = not user.is_active
    user.save(update_fields=['is_active'])
    return user

def reset_user_password(user: CustomUser) -> str:
    """Genera una contraseña temporal segura, la aplica y la retorna."""
    new_password = secrets.token_urlsafe(12)
    user.set_password(new_password)
    user.save(update_fields=['password'])
    return new_password

