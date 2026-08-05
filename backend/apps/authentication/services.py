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


@transaction.atomic
def verify_bootcamper(bootcamper, verified_by):
    """Mark a bootcamper's profile as verified (CR-254).

    Only allowed from PENDING_VERIFICATION — a bootcamper can't skip straight
    from INVITED (never activated their account, so there's nothing to
    verify yet) to VERIFIED.
    """
    if bootcamper.verification_status != CustomUser.VerificationStatus.PENDING_VERIFICATION:
        raise ValidationError({
            'error': 'Sólo se puede verificar a un bootcamper en estado Pendiente de verificación.',
            'code': 'INVALID_VERIFICATION_TRANSITION',
        })

    bootcamper.verification_status = CustomUser.VerificationStatus.VERIFIED
    bootcamper.verified_by = verified_by
    bootcamper.verified_at = now()
    bootcamper.save(update_fields=['verification_status', 'verified_by', 'verified_at', 'updated_at'])
    return bootcamper
