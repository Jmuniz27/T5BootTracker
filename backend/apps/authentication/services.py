"""Business logic for authentication app."""
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils.timezone import now
from rest_framework.exceptions import ValidationError

from .models import CustomUser

# El link de invitación se firma stateless (mismo patrón que
# payments.services.make_receipt_token), no en Redis: 72h es demasiado para
# depender de que Redis no se reinicie, y no hace falta poder revocarlo antes
# de tiempo salvo al reenviar (ver read_onboarding_token, que compara `iat`
# contra el último token emitido y así invalida cualquier link anterior).
ONBOARDING_TOKEN_SALT = 'authentication.onboarding'
ONBOARDING_TOKEN_MAX_AGE = 72 * 60 * 60


def make_onboarding_token(user) -> str:
    """Sign a one-time onboarding token and record when it was issued.

    Recording ``onboarding_token_issued_at`` on the user is what makes the
    token single-use in practice: a resend calls this again, which moves the
    timestamp forward, and ``read_onboarding_token`` rejects any token whose
    embedded ``iat`` no longer matches.
    """
    issued_at = now()
    user.onboarding_token_issued_at = issued_at
    user.save(update_fields=['onboarding_token_issued_at', 'updated_at'])
    return signing.dumps(
        {'uid': str(user.pk), 'iat': issued_at.isoformat()},
        salt=ONBOARDING_TOKEN_SALT,
    )


def read_onboarding_token(token: str) -> CustomUser:
    """Return the CustomUser for a valid onboarding token.

    Raises ValidationError with a distinguishable `code` for each failure
    mode: TOKEN_INVALID (tampered signature), TOKEN_EXPIRED (>72h),
    TOKEN_SUPERSEDED (a newer token was issued, e.g. via resend) and
    ALREADY_ACTIVATED (the account is no longer INVITED).
    """
    try:
        payload = signing.loads(token, salt=ONBOARDING_TOKEN_SALT, max_age=ONBOARDING_TOKEN_MAX_AGE)
    except signing.SignatureExpired:
        raise ValidationError({'error': 'El enlace de invitación expiró.', 'code': 'TOKEN_EXPIRED'})
    except signing.BadSignature:
        raise ValidationError({'error': 'El enlace de invitación no es válido.', 'code': 'TOKEN_INVALID'})

    try:
        user = CustomUser.objects.get(pk=payload['uid'])
    except (CustomUser.DoesNotExist, KeyError, ValueError):
        raise ValidationError({'error': 'El enlace de invitación no es válido.', 'code': 'TOKEN_INVALID'})

    issued_at = user.onboarding_token_issued_at
    if issued_at is None or issued_at.isoformat() != payload.get('iat'):
        raise ValidationError({
            'error': 'Este enlace ya no es válido — se generó uno nuevo.',
            'code': 'TOKEN_SUPERSEDED',
        })

    if user.verification_status != CustomUser.VerificationStatus.INVITED:
        raise ValidationError({
            'error': 'Esta cuenta ya fue activada.',
            'code': 'ALREADY_ACTIVATED',
        })

    return user


def build_invitation_link(token: str) -> str:
    return f'{settings.FRONTEND_URL}/onboarding/{token}'


# Desde dónde se puede resolver una revisión (issue #309). REJECTED entra en la
# lista porque un rechazo no puede ser terminal: el vendedor corrige los datos
# con la persona y después tiene que poder verificar. Sin esto, un rechazo
# dejaría al bootcamper en ese estado para siempre.
REVIEWABLE_VERIFICATION_STATUSES = (
    CustomUser.VerificationStatus.PENDING_VERIFICATION,
    CustomUser.VerificationStatus.REJECTED,
)


@transaction.atomic
def verify_bootcamper(bootcamper, verified_by):
    """Mark a bootcamper's profile as verified (CR-254).

    Allowed from PENDING_VERIFICATION or REJECTED — nunca desde INVITED, que es
    quien todavía no activó la cuenta y por lo tanto no tiene datos que revisar.
    Al verificar se limpia el motivo de un rechazo anterior: ya no aplica.
    """
    if bootcamper.verification_status not in REVIEWABLE_VERIFICATION_STATUSES:
        raise ValidationError({
            'error': 'Sólo se puede verificar a un bootcamper pendiente de verificación o rechazado.',
            'code': 'INVALID_VERIFICATION_TRANSITION',
        })

    bootcamper.verification_status = CustomUser.VerificationStatus.VERIFIED
    bootcamper.verified_by = verified_by
    bootcamper.verified_at = now()
    bootcamper.verification_rejection_reason = ''
    bootcamper.save(update_fields=[
        'verification_status', 'verified_by', 'verified_at',
        'verification_rejection_reason', 'updated_at',
    ])

    # Se encola desde acá y no desde la vista para que cualquier vía futura de
    # verificación notifique igual, sin depender de que quien la escriba se
    # acuerde.
    from apps.notifications.tasks import send_verification_approved_email
    send_verification_approved_email.delay(str(bootcamper.id))

    return bootcamper


@transaction.atomic
def reject_bootcamper(bootcamper, rejected_by, reason):
    """Mark a bootcamper's profile as rejected, with what needs fixing (#309).

    Espejo de `verify_bootcamper`. El motivo es obligatorio: sin él el correo no
    le sirve de nada a quien lo recibe, que se quedaría sabiendo que algo está
    mal pero no qué.
    """
    if bootcamper.verification_status not in REVIEWABLE_VERIFICATION_STATUSES:
        raise ValidationError({
            'error': 'Sólo se puede rechazar a un bootcamper pendiente de verificación.',
            'code': 'INVALID_VERIFICATION_TRANSITION',
        })

    bootcamper.verification_status = CustomUser.VerificationStatus.REJECTED
    bootcamper.verified_by = rejected_by
    bootcamper.verified_at = now()
    bootcamper.verification_rejection_reason = reason.strip()
    bootcamper.save(update_fields=[
        'verification_status', 'verified_by', 'verified_at',
        'verification_rejection_reason', 'updated_at',
    ])

    from apps.notifications.tasks import send_verification_rejected_email
    send_verification_rejected_email.delay(str(bootcamper.id))

    return bootcamper
