"""Serializers for leads app."""
from django.utils.timezone import now
from rest_framework import serializers

from .models import Lead, Interaction


class InteractionSerializer(serializers.ModelSerializer):
    days_as_lead = serializers.SerializerMethodField()
    salesperson_name = serializers.SerializerMethodField()

    class Meta:
        model = Interaction
        fields = (
            'id', 'lead', 'salesperson', 'salesperson_name',
            'interaction_type', 'outcome', 'interest_level',
            'notes', 'campaign', 'duration_minutes', 'next_action',
            'next_action_date', 'days_as_lead', 'created_at',
        )
        read_only_fields = ('id', 'lead', 'salesperson', 'salesperson_name', 'created_at', 'days_as_lead')

    def get_days_as_lead(self, obj):
        return obj.days_as_lead

    def get_salesperson_name(self, obj):
        return obj.salesperson.get_full_name()


class LeadListSerializer(serializers.ModelSerializer):
    interaction_count = serializers.IntegerField(read_only=True)
    days_assigned = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = (
            'id', 'name', 'phone', 'email', 'source', 'status',
            'is_company', 'program_interest', 'interaction_count',
            'days_assigned', 'owner', 'owner_name', 'created_at',
        )

    def get_days_assigned(self, obj):
        if obj.assigned_at:
            return (now().date() - obj.assigned_at.date()).days
        return None

    def get_owner_name(self, obj):
        if obj.owner:
            return obj.owner.get_full_name()
        return None


class LeadWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lead
        fields = (
            'name', 'phone', 'email', 'program_interest',
            'source', 'is_company', 'status',
        )

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('El nombre no puede estar vacío.')
        return value

    def validate_phone(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('El teléfono no puede estar vacío.')
        return value


class ConvertLeadSerializer(serializers.Serializer):
    """Validate lead-to-bootcamper conversion input."""
    cedula     = serializers.CharField(max_length=10)
    program_id = serializers.UUIDField()
    email      = serializers.EmailField(required=False, allow_blank=True)
    phone      = serializers.CharField(required=False, allow_blank=True)


class ReturningBootcamperSerializer(serializers.Serializer):
    """Create a new lead for a returning bootcamper."""
    bootcamper_email = serializers.EmailField()
    program_id       = serializers.UUIDField()
    source           = serializers.ChoiceField(choices=Lead.Source.choices, default=Lead.Source.MANUAL)
    notes            = serializers.CharField(required=False, allow_blank=True)
