import logging
import secrets

from django.db import IntegrityError
from rest_framework.exceptions import NotFound, ValidationError

from apps.authentication.models import CustomUser
from apps.authentication.services import make_onboarding_token, build_invitation_link
from apps.leads.models import Interaction
from apps.programs.models import Enrollment
from apps.programs.services import resolve_assignable_cohort

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


def change_enrollment_cohort(bootcamper: CustomUser, enrollment_id, cohort_id, changed_by: CustomUser) -> Enrollment:
    """Asigna o cambia la cohorte de una inscripción existente (CB-347).

    La cohorte hoy sólo se fija una vez, al convertir el lead — no había forma
    de corregirla ni de completarla después si el programa todavía no tenía
    cohortes creadas en ese momento. Reusa `resolve_assignable_cohort` para no
    duplicar las reglas de pertenencia/estado que ya aplica la conversión.

    `cohort_id=None` vacía la cohorte (por si se asignó una por error y hay
    que dejar la inscripción sin cohorte otra vez).

    Deja rastro en el historial del lead que originó la inscripción — mismo
    patrón que `reassign_lead` usa para las reasignaciones — para que el
    admin pueda ver el cambio sin tener que ser quien lo hizo. Si no hay un
    lead que enlace a este programa (p.ej. datos migrados a mano), el cambio
    igual se aplica; sólo no queda rastro porque no hay dónde escribirlo.

    Raises:
        NotFound: la inscripción no existe o no es de este bootcamper.
        ValidationError: la cohorte no pertenece al programa de la inscripción,
            o no admite inscripciones (ver `resolve_assignable_cohort`).
        ConflictError-like (IntegrityError -> ValidationError): ya existe otra
            inscripción de este bootcamper en ese mismo programa y cohorte.
    """
    try:
        enrollment = Enrollment.objects.select_related('bootcamp', 'cohort').get(
            pk=enrollment_id, bootcamper=bootcamper,
        )
    except Enrollment.DoesNotExist:
        raise NotFound({'error': 'Inscripción no encontrada.', 'code': 'ENROLLMENT_NOT_FOUND'})

    previous_cohort = enrollment.cohort
    new_cohort = resolve_assignable_cohort(enrollment.bootcamp, cohort_id)

    if new_cohort == previous_cohort:
        return enrollment

    enrollment.cohort = new_cohort
    try:
        enrollment.save(update_fields=['cohort', 'updated_at'])
    except IntegrityError:
        raise ValidationError({
            'error': 'El bootcamper ya está inscrito en esa cohorte de este programa.',
            'code': 'ALREADY_ENROLLED',
        })

    _record_cohort_change(bootcamper, enrollment, previous_cohort, new_cohort, changed_by)

    return enrollment


def _record_cohort_change(bootcamper, enrollment, previous_cohort, new_cohort, changed_by):
    """Registra el cambio en el historial del lead, si hay uno para este programa."""
    from apps.leads.models import Lead

    lead = (
        Lead.objects
        .filter(bootcamper=bootcamper, program=enrollment.bootcamp)
        .order_by('-updated_at')
        .first()
    )
    if lead is None:
        logger.info(
            'Cambio de cohorte de %s en %s sin lead asociado — no queda rastro en el historial.',
            bootcamper.id, enrollment.bootcamp_id,
        )
        return

    before = f'cohorte {previous_cohort.number}' if previous_cohort else 'sin cohorte'
    after = f'cohorte {new_cohort.number}' if new_cohort else 'sin cohorte'
    Interaction.objects.create(
        lead=lead,
        salesperson=changed_by,
        interaction_type=Interaction.InteractionType.SYSTEM,
        outcome=Interaction.Outcome.COHORT_CHANGED,
        notes=f'{changed_by.get_full_name()} cambió la cohorte de {before} a {after}.',
        lead_status=lead.status,
    )

