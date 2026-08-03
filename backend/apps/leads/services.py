"""Business logic for leads app."""
import logging
import secrets
from decimal import Decimal

from django.db import transaction, IntegrityError
from django.db.models import Q
from django.utils.timezone import now
from rest_framework.exceptions import ValidationError, NotFound, APIException
from rest_framework import status

from apps.authentication.models import CustomUser
from apps.authentication.validators import validate_cedula_ecuatoriana
from apps.programs.models import Program, Enrollment
from apps.programs.services import apply_discount, resolve_assignable_cohort
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
    if lead.status != Lead.Status.QUALIFIED:
        raise ValidationError({
            'error': 'Solo se puede convertir un lead en estado Calificado.',
            'code': 'LEAD_NOT_QUALIFIED',
        })

    if not validate_cedula_ecuatoriana(validated_data['cedula']):
        raise ValidationError({'error': 'La cédula ingresada no es válida.', 'code': 'INVALID_CEDULA'})

    try:
        program = Program.objects.get(pk=validated_data['program_id'])
    except Program.DoesNotExist:
        # 3. LANZAR NOTFOUND (404)
        raise NotFound({'error': 'Programa no encontrado.', 'code': 'PROGRAM_NOT_FOUND'})

    # Antes de crear nada: si la cohorte no sirve, la conversión no debe empezar.
    cohort = resolve_assignable_cohort(program, validated_data.get('cohort_id'))

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
            parts = lead.name.split() if lead.name else []
            first_name = parts[0] if parts else 'Bootcamper'
            last_name = ' '.join(parts[1:])

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

    discount = validated_data.get('discount_percentage') or Decimal('0.00')
    agreed_price = apply_discount(program.total_cost, discount)

    try:
        Enrollment.objects.create(
            bootcamper=bootcamper,
            bootcamp=program,
            cohort=cohort,
            # Con cohorte manda su mes de inicio: es cuando esta persona empieza
            # de verdad, y puede no coincidir con el arranque del programa.
            start_date=cohort.start_month if cohort else program.start_date,
            discount_percentage=discount,
            agreed_price=agreed_price,
        )
    except IntegrityError:
        raise ConflictError({'error': 'El bootcamper ya está inscrito en este programa.', 'code': 'ALREADY_ENROLLED'})

    lead.status = Lead.Status.CONVERTED
    lead.program = program
    # Deja el rastro vendedor → bootcamper: el vendedor es `lead.owner`, y sin
    # este enlace no se puede reconstruir a quién trajo cada bootcamper.
    lead.bootcamper = bootcamper
    lead.save(update_fields=['status', 'program', 'bootcamper', 'updated_at'])

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
        # Se devuelven para que el vendedor confirme en pantalla lo que quedó
        # registrado, sin volver a consultar la inscripción.
        'discount_percentage': str(discount),
        'agreed_price': str(agreed_price),
        'cohort_id': str(cohort.id) if cohort else None,
        'cohort_number': cohort.number if cohort else None,
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


@transaction.atomic
def reassign_lead_by_admin(lead_id, admin_user, new_owner=None):
    """Force-release or force-reassign a lead as an Administrator (CR-005).

    ``new_owner=None`` releases the lead back to the unassigned pool; a
    ``CustomUser`` reassigns it directly. Either way, an audit trail is left
    as a system Interaction (who did it, previous owner, timestamp) — there is
    no dedicated audit table, so this is the one place that must run whenever
    an admin changes a lead's owner (also called from
    ``LeadAdminWriteSerializer.update`` for the generic PATCH path).
    """
    lead = Lead.objects.select_for_update().get(pk=lead_id)
    previous_owner = lead.owner

    lead.owner = new_owner
    lead.assigned_at = now() if new_owner else None
    # CR-006: al reasignar arranca una tenencia nueva (released_at se limpia);
    # al liberar se cierra la anterior. Debe ir en update_fields o no persiste.
    lead.released_at = None if new_owner else now()
    lead.version += 1
    lead.save(update_fields=['owner', 'assigned_at', 'released_at', 'version', 'updated_at'])

    previous_owner_name = previous_owner.get_full_name() if previous_owner else 'sin asignar'
    if new_owner:
        notes = (
            f'Lead reasignado por {admin_user.get_full_name()} '
            f'de {previous_owner_name} a {new_owner.get_full_name()}.'
        )
    else:
        notes = f'Lead liberado por {admin_user.get_full_name()} (antes: {previous_owner_name}).'

    Interaction.objects.create(
        lead=lead,
        salesperson=admin_user,
        interaction_type=Interaction.InteractionType.SYSTEM,
        outcome=Interaction.Outcome.REASSIGNED,
        notes=notes,
    )

    return lead
