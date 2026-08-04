"""Business logic for authentication app."""
from django.db import transaction
from django.utils.timezone import now
from rest_framework.exceptions import ValidationError

from .models import CustomUser


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
