"""Serializers for leads app."""
from decimal import Decimal

from django.utils.timezone import now
from rest_framework import serializers

from apps.authentication.models import CustomUser
from .models import Lead, Interaction, LeadAssignmentSetting
from .services import reassign_lead_by_admin


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
    last_outcome = serializers.CharField(read_only=True, allow_null=True, default=None)
    last_interaction_at = serializers.DateTimeField(read_only=True, allow_null=True, default=None)
    days_assigned = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = (
            'id', 'name', 'phone', 'email', 'source', 'status',
            'is_company', 'program_interest', 'interaction_count',
            'last_outcome', 'last_interaction_at', 'days_assigned',
            'owner', 'owner_name', 'created_at',
        )

    def get_days_assigned(self, obj):
        # CR-006: si el lead ya fue liberado, la retención se cuenta hasta esa
        # fecha, no hasta hoy.
        if obj.assigned_at:
            end = obj.released_at or now()
            return (end.date() - obj.assigned_at.date()).days
        return None

    def get_owner_name(self, obj):
        if obj.owner:
            return obj.owner.get_full_name()
        return None


class LeadDetailSerializer(serializers.ModelSerializer):
    interaction_count = serializers.IntegerField(read_only=True)
    days_assigned = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = (
            'id', 'name', 'phone', 'email', 'source', 'status',
            'is_company', 'program_interest', 'program', 'interaction_count',
            'owner', 'owner_name', 'assigned_at', 'released_at', 'days_assigned',
            'last_contact', 'created_at', 'updated_at',
        )

    def get_days_assigned(self, obj):
        # CR-006: si el lead ya fue liberado, la retención se cuenta hasta esa
        # fecha, no hasta hoy.
        if obj.assigned_at:
            end = obj.released_at or now()
            return (end.date() - obj.assigned_at.date()).days
        return None

    def get_owner_name(self, obj):
        if obj.owner:
            return obj.owner.get_full_name()
        return None


class LeadWriteSerializer(serializers.ModelSerializer):
    confirm_duplicate = serializers.BooleanField(required=False, default=False, write_only=True)

    class Meta:
        model = Lead
        fields = (
            'name', 'phone', 'email', 'program_interest',
            'source', 'is_company', 'status', 'confirm_duplicate',
        )

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('El nombre no puede estar vacío.')
        return value

    def validate_phone(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('El teléfono no puede estar vacío.')
        return value

    def create(self, validated_data):
        validated_data.pop('confirm_duplicate', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('confirm_duplicate', None)
        return super().update(instance, validated_data)


class LeadAdminWriteSerializer(LeadWriteSerializer):
    """Like LeadWriteSerializer but exposes `owner` so admins can reassign leads."""
    owner = serializers.PrimaryKeyRelatedField(
        queryset=CustomUser.objects.filter(role=CustomUser.Role.SALESPERSON),
        required=False,
        allow_null=True,
    )

    class Meta(LeadWriteSerializer.Meta):
        fields = LeadWriteSerializer.Meta.fields + ('owner',)

    def update(self, instance, validated_data):
        if 'owner' in validated_data:
            new_owner = validated_data.pop('owner')
            if new_owner != instance.owner:
                admin_user = self.context['request'].user
                instance = reassign_lead_by_admin(instance.pk, admin_user, new_owner)
        return super().update(instance, validated_data)


class ConvertLeadSerializer(serializers.Serializer):
    """Validate lead-to-bootcamper conversion input."""
    cedula     = serializers.CharField(max_length=10)
    program_id = serializers.UUIDField()
    email      = serializers.EmailField(required=False, allow_blank=True)
    phone      = serializers.CharField(required=False, allow_blank=True)
    # Sólo el porcentaje: el precio final lo calcula el backend. Si el cliente
    # pudiera mandarlo, cualquiera podría inscribir a alguien por el monto que
    # quisiera sin dejar rastro de por qué.
    discount_percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal('0'),
        max_value=Decimal('100'),
        required=False,
        default=Decimal('0.00'),
    )


class ReturningBootcamperSerializer(serializers.Serializer):
    """Create a new lead for a returning bootcamper."""
    bootcamper_email = serializers.EmailField()
    program_id       = serializers.UUIDField()
    source           = serializers.ChoiceField(choices=Lead.Source.choices, default=Lead.Source.MANUAL)
    notes            = serializers.CharField(required=False, allow_blank=True)


class LeadAssignmentSettingSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LeadAssignmentSetting
        fields = ('self_assign_enabled', 'updated_by_name', 'updated_at')
        read_only_fields = ('updated_by_name', 'updated_at')

    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() if obj.updated_by else None
