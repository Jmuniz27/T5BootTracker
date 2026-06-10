"""Business logic for leads app."""
from django.db import transaction
from django.utils.timezone import now

from .models import Interaction, Lead

# Outcome of an interaction -> resulting lead status (when it implies a transition).
OUTCOME_TO_STATUS = {
    Interaction.Outcome.INTERESTED:        Lead.Status.INTERESTED,
    Interaction.Outcome.NOT_INTERESTED:    Lead.Status.NOT_INTERESTED,
    Interaction.Outcome.SPEAK_COORDINATOR: Lead.Status.SPEAK_COORDINATOR,
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

    lead.save(update_fields=update_fields)
    return interaction
