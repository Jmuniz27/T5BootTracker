"""Business logic for leads app."""
import logging
import secrets

from django.db import transaction, IntegrityError
from django.db.models import Q
from django.utils.timezone import now
from rest_framework.exceptions import ValidationError, NotFound, APIException
from rest_framework import status

from apps.authentication.models import CustomUser
from apps.authentication.validators import validate_cedula_ecuatoriana
from apps.programs.models import Program, Enrollment
from apps.notifications.tasks import send_conversion_notification
from .models import Interaction, Lead, LeadAssignmentSetting

logger = logging.getLogger(__name__)

class ConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Conflicto en la base de datos.'
    default_code = 'conflict'

# Outcome of an interaction -> resulting lead status (when it implies a transition).
OUTCOME_TO_STATUS = {
    Interaction.Outcome.SEND_INFO:         Lead.Status.INTERESTED,
    Interaction.Outcome.SCHEDULE_VISIT:    Lead.Status.QUALIFIED,
}

@transaction.atomic
def register_interaction(lead, user, validated_data):
    """Create an interaction and update the lead's status and last_contact atomically.

    Returns the created Interaction.
    """
    interaction = Interaction.objects.create(
        lead=lead,
        salesperson=user,
        **validated_data,
    )

    update_fields = ['last_contact', 'updated_at']
    lead.last_contact = now()

    new_status = OUTCOME_TO_STATUS.get(interaction.outcome)
    if new_status:
        lead.status = new_status
        update_fields.append('status')
    elif lead.status == Lead.Status.NEW:
        # Registering any interaction on a NEW lead auto-transitions it to INTERESTED.
        # CONTACTED is no longer a distinct status; first contact implies interest.
        lead.status = Lead.Status.INTERESTED
        update_fields.append('status')

    lead.save(update_fields=update_fields)
    return interaction


@transaction.atomic
def convert_lead_to_bootcamper(lead, validated_data):
    if not validate_cedula_ecuatoriana(validated_data['cedula']):
        raise ValidationError({'error': 'La cédula ingresada no es válida.', 'code': 'INVALID_CEDULA'})

    try:
        program = Program.objects.get(pk=validated_data['program_id'])
    except Program.DoesNotExist:
        # 3. LANZAR NOTFOUND (404)
        raise NotFound({'error': 'Programa no encontrado.', 'code': 'PROGRAM_NOT_FOUND'})

    email = validated_data.get('email') or lead.email
    phone = validated_data.get('phone') or lead.phone

    temporary_password = None
    is_returning = False
    bootcamper = None

    if email:
        try:
            existing = CustomUser.objects.get(email=email)
            if existing.role != CustomUser.Role.BOOTCAMPER:
                # 4. LANZAR CONFLICTERROR (409)
                raise ConflictError({'error': 'El email ya está asociado a otro rol.', 'code': 'EMAIL_CONFLICT'})
            bootcamper = existing
            is_returning = True
        except CustomUser.DoesNotExist:
            pass

    if bootcamper is None:
        temporary_password = secrets.token_urlsafe(12)
        try:
            first_name = lead.name.split()[0] if lead.name else 'Bootcamper'
            last_name = ' '.join(lead.name.split()[1:]) if len(lead.name.split()) > 1 else 'N/A'

            bootcamper = CustomUser.objects.create_user(
                email=email or f'bootcamper_{validated_data["cedula"]}@placeholder.com',
                password=temporary_password,
                first_name=first_name,
                last_name=last_name,
                role=CustomUser.Role.BOOTCAMPER,
                cedula=validated_data['cedula'],
                phone=phone,
            )
        except IntegrityError:
            # 5. LANZAR CONFLICTERROR (409)
            raise ConflictError({'error': 'Esta cédula ya está registrada en el sistema.', 'code': 'CEDULA_ALREADY_EXISTS'})

    try:
        Enrollment.objects.create(
            bootcamper=bootcamper,
            bootcamp=program,
            start_date=program.start_date,
            agreed_price=program.total_cost
        )
    except IntegrityError:
        raise ConflictError({'error': 'El bootcamper ya está inscrito en este programa.', 'code': 'ALREADY_ENROLLED'})

    lead.status = Lead.Status.CONVERTED
    lead.program = program
    lead.save(update_fields=['status', 'program', 'updated_at'])

    try:
        send_conversion_notification.delay(str(lead.id), str(bootcamper.id))
    except Exception:
        logger.warning(
            'Could not enqueue conversion notification for lead %s — Celery/Redis may be unavailable.',
            lead.id,
        )

    return {
        'bootcamper_id': str(bootcamper.id),
        'email': bootcamper.email,
        'temporary_password': temporary_password,
        'is_returning': is_returning,
        'lead_status': lead.status,
    }


def get_self_assignment_enabled():
    """Whether salespeople are currently allowed to self-assign leads (CR-004)."""
    return LeadAssignmentSetting.get_solo().self_assign_enabled


@transaction.atomic
def set_self_assignment_enabled(enabled, user):
    """Toggle the global self-assignment setting, recording who changed it and when."""
    setting = LeadAssignmentSetting.objects.select_for_update().get_or_create(pk=1)[0]
    setting.self_assign_enabled = enabled
    setting.updated_by = user
    setting.save(update_fields=['self_assign_enabled', 'updated_by', 'updated_at'])
    logger.info(
        'Lead self-assignment %s by %s',
        'enabled' if enabled else 'disabled',
        user.email,
    )
    return setting


def find_duplicate_lead(phone, email):
    """Return an existing Lead matching phone or email, if any (CR-011)."""
    query = Q(phone=phone)
    if email:
        query |= Q(email=email)
    return Lead.objects.filter(query).first()
