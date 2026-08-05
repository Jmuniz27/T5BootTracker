"""Business logic for leads app."""
import logging
from decimal import Decimal

from django.db import transaction, IntegrityError
from django.db.models import F, Func, Q, Value
from django.utils.timezone import now
from rest_framework.exceptions import ValidationError, NotFound, APIException
from rest_framework import status

from apps.authentication.models import CustomUser
from apps.authentication.validators import validate_identificacion
from apps.authentication.services import make_onboarding_token, build_invitation_link
from apps.programs.models import Program, Enrollment
from apps.programs.services import apply_discount, resolve_assignable_cohort
from apps.notifications.tasks import send_conversion_notification, send_bootcamper_invitation_email
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

    if not validate_identificacion(validated_data['cedula']):
        raise ValidationError({'error': 'La identificación ingresada no es válida.', 'code': 'INVALID_CEDULA'})

    try:
        program = Program.objects.get(pk=validated_data['program_id'])
    except Program.DoesNotExist:
        # 3. LANZAR NOTFOUND (404)
        raise NotFound({'error': 'Programa no encontrado.', 'code': 'PROGRAM_NOT_FOUND'})

    # Antes de crear nada: si la cohorte no sirve, la conversión no debe empezar.
    cohort = resolve_assignable_cohort(program, validated_data.get('cohort_id'))

    email = validated_data['email']
    phone = validated_data.get('phone') or lead.phone

    invitation_link = None
    is_returning = False
    bootcamper = None

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
        try:
            parts = lead.name.split() if lead.name else []
            first_name = parts[0] if parts else 'Bootcamper'
            last_name = ' '.join(parts[1:])

            # password=None deja la cuenta con contraseña no utilizable
            # (CustomUserManager.create_user -> set_password(None)); la
            # persona la define ella misma al activar la invitación.
            bootcamper = CustomUser.objects.create_user(
                email=email,
                password=None,
                first_name=first_name,
                last_name=last_name,
                role=CustomUser.Role.BOOTCAMPER,
                cedula=validated_data['cedula'],
                phone=phone,
                verification_status=CustomUser.VerificationStatus.INVITED,
            )
        except IntegrityError:
            # 5. LANZAR CONFLICTERROR (409)
            raise ConflictError({'error': 'Esta cédula ya está registrada en el sistema.', 'code': 'CEDULA_ALREADY_EXISTS'})

        token = make_onboarding_token(bootcamper)
        invitation_link = build_invitation_link(token)

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
        # Complementa la notificación a coordinadores — esta es la única que
        # efectivamente llega al bootcamper. Sólo aplica a cuentas nuevas: un
        # recurrente no recibe invitación porque no se le tocó la contraseña.
        if invitation_link:
            send_bootcamper_invitation_email.delay(str(bootcamper.id), invitation_link)
    except Exception:
        logger.warning(
            'Could not enqueue conversion notification for lead %s — Celery/Redis may be unavailable.',
            lead.id,
        )

    return {
        'bootcamper_id': str(bootcamper.id),
        'email': bootcamper.email,
        'invitation_link': invitation_link,
        'is_returning': is_returning,
        'lead_status': lead.status,
        # Se devuelven para que el vendedor confirme en pantalla lo que quedó
        # registrado, sin volver a consultar la inscripción.
        'discount_percentage': str(discount),
        'agreed_price': str(agreed_price),
        'cohort_id': str(cohort.id) if cohort else None,
        'cohort_number': cohort.number if cohort else None,
    }


def resend_invitation(lead):
    """Issue a new onboarding token for `lead.bootcamper` and re-send the email (#255).

    Generating a new token via `make_onboarding_token` already invalidates
    the previous link (TOKEN_SUPERSEDED, see `read_onboarding_token`) — no
    separate revocation step is needed.
    """
    bootcamper = lead.bootcamper
    if bootcamper is None:
        raise ValidationError({
            'error': 'Este lead todavía no fue convertido a bootcamper.',
            'code': 'NOT_CONVERTED',
        })
    if bootcamper.verification_status != CustomUser.VerificationStatus.INVITED:
        raise ValidationError({
            'error': 'Esta cuenta ya fue activada; no se puede reenviar la invitación.',
            'code': 'ALREADY_ACTIVATED',
        })

    token = make_onboarding_token(bootcamper)
    invitation_link = build_invitation_link(token)

    try:
        send_bootcamper_invitation_email.delay(str(bootcamper.id), invitation_link)
    except Exception:
        logger.warning(
            'Could not enqueue invitation resend for bootcamper %s — Celery/Redis may be unavailable.',
            bootcamper.id,
        )

    return {'invitation_link': invitation_link}


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


# Los teléfonos llegan al CRM en formato local ecuatoriano (0991000001, como los
# siembra seed_dev) y desde WhatsApp en E.164 sin '+' (593991000001). Nada los
# normaliza al guardarlos, así que comparar exacto nunca cruza los dos formatos.
# Lo único que ambos comparten es el número de abonado: los últimos 9 dígitos.
SUBSCRIBER_DIGITS = 9


def normalize_phone(raw):
    """Return only the digits in ``raw``; empty string when there are none."""
    if not raw:
        return ''
    return ''.join(char for char in str(raw) if char.isdigit())


def find_lead_by_phone(raw):
    """Return the Lead whose phone matches ``raw`` by subscriber number, or None.

    Compares the last ``SUBSCRIBER_DIGITS`` digits of both sides, so a lead saved
    as ``0991000001`` is reachable from WhatsApp's ``593991000001``. The stored
    column is free text, so it is stripped to digits inside the query rather than
    matched raw: a lead saved as ``099-100-0001`` still has to match.
    """
    normalized = normalize_phone(raw)
    if len(normalized) < SUBSCRIBER_DIGITS:
        return None

    subscriber = normalized[-SUBSCRIBER_DIGITS:]
    matches = list(
        Lead.objects
        .annotate(phone_digits=Func(
            F('phone'), Value('[^0-9]'), Value(''), Value('g'),
            function='regexp_replace',
        ))
        .filter(phone_digits__endswith=subscriber)
        .order_by('-created_at')
    )
    if not matches:
        return None

    # Dos leads pueden compartir el abonado si uno se guardó con código de país y
    # el otro sin él: gana el que coincide entero, no el más reciente.
    for lead in matches:
        if normalize_phone(lead.phone) == normalized:
            return lead
    return matches[0]


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


# ─── Cierre de leads (#324) ───────────────────────────────────────────────────

def discard_lead(lead_id, user, reason, detail=''):
    """Sacar un lead del listado de seguimiento, dejando por qué.

    La clienta lo pidió para poder "rayar los que ya no los llames" y saber la
    razón de cada salida. El motivo es obligatorio y estructurado: si viviera en
    las notas de una interacción sería indistinguible de cualquier otro
    comentario, que fue justo su objeción.

    Raises:
        ValidationError: motivo ausente o inválido, detalle faltante cuando el
            motivo es OTHER, o lead ya convertido / ya descartado.
        NotFound: el lead no existe.
    """
    if not Lead.objects.filter(pk=lead_id).exists():
        raise NotFound({'error': 'Lead no encontrado.', 'code': 'LEAD_NOT_FOUND'})

    valid = {choice.value for choice in Lead.DiscardReason}
    if reason not in valid:
        raise ValidationError({
            'error': 'El motivo del descarte es obligatorio y debe ser uno de los válidos.',
            'code': 'DISCARD_REASON_REQUIRED',
        })

    detail = (detail or '').strip()
    if reason == Lead.DiscardReason.OTHER and not detail:
        # "Otro" sin explicación no aporta nada al reporte: es el único caso en
        # que la causal por sí sola no dice nada.
        raise ValidationError({
            'error': 'Con el motivo "Otro" hay que escribir el detalle.',
            'code': 'DISCARD_DETAIL_REQUIRED',
        })

    with transaction.atomic():
        lead = Lead.objects.select_for_update().get(pk=lead_id)

        if lead.status == Lead.Status.DISCARDED:
            raise ValidationError({
                'error': 'Este lead ya está descartado.',
                'code': 'LEAD_ALREADY_DISCARDED',
            })
        if lead.status == Lead.Status.CONVERTED:
            # Ya es bootcamper: sacarlo del listado comercial no tendría sentido
            # y dejaría su inscripción colgando de un lead cerrado.
            raise ValidationError({
                'error': 'Un lead ya convertido no se puede descartar.',
                'code': 'LEAD_ALREADY_CONVERTED',
            })

        lead.status_before_discard = lead.status
        lead.status = Lead.Status.DISCARDED
        lead.discard_reason = reason
        lead.discard_detail = detail
        lead.discarded_at = now()
        lead.discarded_by = user
        lead.version += 1
        lead.save(update_fields=[
            'status', 'status_before_discard', 'discard_reason', 'discard_detail',
            'discarded_at', 'discarded_by', 'version', 'updated_at',
        ])

        Interaction.objects.create(
            lead=lead,
            salesperson=user,
            interaction_type=Interaction.InteractionType.SYSTEM,
            outcome=Interaction.Outcome.DISCARDED,
            notes=(
                f'Lead descartado por {user.get_full_name()}. '
                f'Motivo: {lead.get_discard_reason_display()}.'
                + (f' Detalle: {detail}' if detail else '')
            ),
        )

    logger.info('Lead %s descartado por %s (%s)', lead_id, user.id, reason)
    return lead


def restore_lead(lead_id, user):
    """Deshacer un descarte, devolviendo el lead al estado que tenía.

    Un descarte por error no debería ser definitivo. Se vuelve al estado previo
    guardado y no a uno fijo, para no inventarle al lead una etapa comercial que
    nunca tuvo.
    """
    if not Lead.objects.filter(pk=lead_id).exists():
        raise NotFound({'error': 'Lead no encontrado.', 'code': 'LEAD_NOT_FOUND'})

    with transaction.atomic():
        lead = Lead.objects.select_for_update().get(pk=lead_id)

        if lead.status != Lead.Status.DISCARDED:
            raise ValidationError({
                'error': 'Este lead no está descartado.',
                'code': 'LEAD_NOT_DISCARDED',
            })

        previous = lead.status_before_discard or Lead.Status.NEW
        lead.status = previous
        lead.status_before_discard = ''
        lead.discard_reason = ''
        lead.discard_detail = ''
        lead.discarded_at = None
        lead.discarded_by = None
        lead.version += 1
        lead.save(update_fields=[
            'status', 'status_before_discard', 'discard_reason', 'discard_detail',
            'discarded_at', 'discarded_by', 'version', 'updated_at',
        ])

        Interaction.objects.create(
            lead=lead,
            salesperson=user,
            interaction_type=Interaction.InteractionType.SYSTEM,
            outcome=Interaction.Outcome.RESTORED,
            notes=f'Descarte deshecho por {user.get_full_name()}. Vuelve a {lead.get_status_display()}.',
        )

    logger.info('Lead %s reactivado por %s', lead_id, user.id)
    return lead
