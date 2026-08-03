from rest_framework import serializers
from apps.authentication.models import CustomUser
from apps.authentication.serializers import UserDataSerializer
from apps.authentication.validators import validate_cedula_ecuatoriana

COORDINATOR_FIELDS = ('coordinator_scope', 'coordinator_program')


class CoordinatorScopeMixin:
    """Valida la coherencia entre rol, alcance y programa del coordinador.

    Reglas:
      - Un COORDINATOR debe declarar alcance (general o por programa).
      - Alcance PROGRAM exige programa; alcance GENERAL lo prohíbe.
      - Ningún otro rol admite alcance ni programa; si el rol cambia y deja
        restos de una asignación anterior, se limpian en silencio.

    Sólo se evalúa cuando el payload toca el rol o el alcance: un PATCH
    parcial de otro campo no debe fallar por una asignación heredada (los
    coordinadores creados antes de esta función no tienen alcance). Los campos
    ausentes se resuelven contra la instancia en edición.
    """

    def validate(self, attrs):
        attrs = super().validate(attrs)

        if not {'role', *COORDINATOR_FIELDS} & set(attrs):
            return attrs

        def resolve(field):
            if field in attrs:
                return attrs[field]
            return getattr(self.instance, field, None) if self.instance else None

        role    = resolve('role')
        scope   = resolve('coordinator_scope')
        program = resolve('coordinator_program')

        if role == CustomUser.Role.COORDINATOR:
            if not scope:
                raise serializers.ValidationError({
                    'coordinator_scope': 'Indica si el coordinador es general o de un programa.',
                })
            if scope == CustomUser.CoordinatorScope.PROGRAM and program is None:
                raise serializers.ValidationError({
                    'coordinator_program': 'Selecciona el programa que coordina.',
                })
            if scope == CustomUser.CoordinatorScope.GENERAL and program is not None:
                raise serializers.ValidationError({
                    'coordinator_program': 'Un coordinador general no se asocia a un programa.',
                })
        elif attrs.get('coordinator_scope') or attrs.get('coordinator_program'):
            raise serializers.ValidationError({
                'coordinator_scope': 'Sólo los coordinadores tienen alcance y programa asignado.',
            })
        else:
            attrs['coordinator_scope']   = ''
            attrs['coordinator_program'] = None

        return attrs


class AdminUserSerializer(CoordinatorScopeMixin, UserDataSerializer):
    """
    Hereda del serializador base de usuarios pero expone la cédula y la
    asignación de coordinador exclusivamente para el panel de administración.
    """
    coordinator_program_name = serializers.CharField(
        source='coordinator_program.name', read_only=True, default=None,
    )

    class Meta(UserDataSerializer.Meta):
        fields = UserDataSerializer.Meta.fields + ('cedula',) + COORDINATOR_FIELDS + (
            'coordinator_program_name',
        )


class CreateUserSerializer(CoordinatorScopeMixin, serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})

    class Meta:
        model = CustomUser
        fields = [
            'email', 'cedula', 'first_name', 'last_name', 'role', 'password', 'phone',
            *COORDINATOR_FIELDS,
        ]

    def validate_email(self, value):
        if CustomUser.objects.filter(email=value).exists():
            raise serializers.ValidationError("Este correo electrónico ya está registrado.")
        return value

    def validate_cedula(self, value):
        if value:
            if not validate_cedula_ecuatoriana(value):
                raise serializers.ValidationError("La cédula ingresada no es válida.")
            if CustomUser.objects.filter(cedula=value).exists():
                raise serializers.ValidationError("Esta cédula ya está registrada.")
        return value






