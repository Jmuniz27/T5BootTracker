import logging
import secrets

from rest_framework.exceptions import ValidationError

from apps.authentication.models import CustomUser
from apps.authentication.services import make_onboarding_token, build_invitation_link

logger = logging.getLogger(__name__)


def create_user(data: dict) -> CustomUser:
    """Crea un usuario, resuelve su contraseña y asigna is_staff si es admin.

    El administrador puede dejar la contraseña en blanco para cualquier rol
    que sí entra a la aplicación (todos salvo COORDINATOR, que es una persona
    de contacto sin acceso): en ese caso, en vez de una credencial inutilizable
    como la del coordinador, se le manda una invitación por correo con un link
    de 72h para que la persona defina su propia contraseña — mismo mecanismo
    que `convert_lead_to_bootcamper` usa para los bootcampers.

    Si el admin sí tecleó una contraseña, se respeta y no se manda invitación.

    `coordinator_programs` es M2M y no se puede pasar al constructor: se aparta
    y se asigna después del primer save, cuando el usuario ya tiene pk.
    """
    password = data.pop('password', None)
    programs = data.pop('coordinator_programs', None)
    role = data.get('role')

    invite = not password and role != CustomUser.Role.COORDINATOR
    if invite:
        data['verification_status'] = CustomUser.VerificationStatus.INVITED

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

    if invite:
        from apps.notifications.tasks import send_staff_invitation_email

        token = make_onboarding_token(user)
        invitation_link = build_invitation_link(token)
        try:
            send_staff_invitation_email.delay(str(user.id), invitation_link)
        except Exception:
            logger.warning(
                'Could not enqueue staff invitation email for user %s — Celery/Redis may be unavailable.',
                user.id,
            )

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

