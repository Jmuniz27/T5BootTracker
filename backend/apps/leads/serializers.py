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


class BootcamperSummarySerializer(serializers.ModelSerializer):
    """Datos de sólo lectura del bootcamper resultante de una conversión (#259)."""
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = (
            'id', 'first_name', 'last_name', 'email', 'phone', 'cedula',
            'verification_status', 'verified_at', 'verified_by_name',
            'verification_rejection_reason', 'onboarding_completed_at',
        )

    def get_verified_by_name(self, obj):
        return obj.verified_by.get_full_name() if obj.verified_by else None


class VerificationRejectSerializer(serializers.Serializer):
    """Motivo con el que se rechazan los datos de un bootcamper (#309).

    Espejo de `PaymentRejectSerializer`: el motivo es obligatorio porque es todo
    lo que el bootcamper va a recibir para saber qué corregir.
    """
    reason = serializers.CharField(min_length=1)

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError('El motivo del rechazo no puede estar vacío.')
        return value


class LeadDiscardSerializer(serializers.Serializer):
    """Motivo con el que se saca un lead del listado (#324).

    La causal es obligatoria y cerrada para que el reporte pueda agrupar por
    ella; el detalle es libre y sólo se exige cuando la causal es "Otro".
    """
    reason = serializers.ChoiceField(choices=Lead.DiscardReason.choices)
    detail = serializers.CharField(required=False, allow_blank=True, default='')


class LeadListSerializer(serializers.ModelSerializer):
    interaction_count = serializers.IntegerField(read_only=True)
    discard_reason_display = serializers.CharField(source='get_discard_reason_display', read_only=True)
    last_outcome = serializers.CharField(read_only=True, allow_null=True, default=None)
    last_interaction_at = serializers.DateTimeField(read_only=True, allow_null=True, default=None)
    days_assigned = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()
    bootcamper_verification_status = serializers.CharField(
        source='bootcamper.verification_status', read_only=True, allow_null=True, default=None,
    )

    class Meta:
        model = Lead
        fields = (
            'id', 'name', 'phone', 'email', 'source', 'status',
            'is_company', 'program_interest', 'interaction_count',
            'last_outcome', 'last_interaction_at', 'days_assigned',
            'owner', 'owner_name', 'created_at',
            'discard_reason', 'discard_reason_display', 'discard_detail', 'discarded_at',
            'bootcamper', 'bootcamper_verification_status',
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
    discard_reason_display = serializers.CharField(source='get_discard_reason_display', read_only=True)
    discarded_by_name = serializers.SerializerMethodField()
    days_assigned = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()
    bootcamper_verification_status = serializers.CharField(
        source='bootcamper.verification_status', read_only=True, allow_null=True, default=None,
    )
    bootcamper_profile = BootcamperSummarySerializer(source='bootcamper', read_only=True)

    class Meta:
        model = Lead
        fields = (
            'id', 'name', 'phone', 'email', 'source', 'status',
            'is_company', 'program_interest', 'program', 'interaction_count',
            'owner', 'owner_name', 'assigned_at', 'released_at', 'days_assigned',
            'last_contact', 'created_at', 'updated_at',
            'discard_reason', 'discard_reason_display', 'discard_detail',
            'discarded_at', 'discarded_by_name',
            'bootcamper', 'bootcamper_verification_status', 'bootcamper_profile',
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

    def get_discarded_by_name(self, obj):
        return obj.discarded_by.get_full_name() if obj.discarded_by else None


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

    def validate_status(self, value):
        # Descartar exige un motivo, y por acá no viaja ninguno. Si se permitiera,
        # el PATCH genérico sería una puerta trasera para cerrar leads sin decir
        # por qué — justo lo que el estado nuevo viene a evitar.
        if value == Lead.Status.DISCARDED:
            raise serializers.ValidationError(
                'Para descartar un lead usa la acción de descarte, que pide el motivo.'
            )
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
    cedula     = serializers.CharField(max_length=13)
    program_id = serializers.UUIDField()
    # Opcional: hay programas sin cohortes creadas todavía, y exigirla bloquearía
    # la conversión. Cuando viene, el servicio comprueba que sea de ese programa
    # y que no esté finalizada.
    cohort_id  = serializers.UUIDField(required=False, allow_null=True)
    # Obligatorio: la cuenta se crea sin contraseña utilizable y la persona la
    # activa vía un link de invitación que llega a este correo (#253). Ya no
    # existe el placeholder bootcamper_<cedula>@placeholder.com.
    email      = serializers.EmailField()
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
