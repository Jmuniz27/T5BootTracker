from rest_framework import serializers
from apps.authentication.models import CustomUser
from apps.authentication.serializers import UserDataSerializer
from apps.authentication.validators import validate_cedula_ecuatoriana

COORDINATOR_FIELDS = ('coordinator_scope', 'coordinator_programs')


class CoordinatorScopeMixin:
    """Valida la coherencia entre rol, alcance y programas del coordinador.

    Reglas:
      - Un COORDINATOR debe declarar alcance (general o por programa).
      - Alcance PROGRAM exige al menos un programa; GENERAL no admite ninguno.
      - Ningún otro rol admite alcance ni programas; si el rol cambia y deja
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
            if self.instance is None:
                return None
            value = getattr(self.instance, field, None)
            # Un M2M no se lee como atributo: hay que resolver el manager.
            return list(value.all()) if hasattr(value, 'all') else value

        role     = resolve('role')
        scope    = resolve('coordinator_scope')
        programs = resolve('coordinator_programs') or []

        if role == CustomUser.Role.COORDINATOR:
            if not scope:
                raise serializers.ValidationError({
                    'coordinator_scope': 'Indica si el coordinador es general o de un programa.',
                })
            if scope == CustomUser.CoordinatorScope.PROGRAM and not programs:
                raise serializers.ValidationError({
                    'coordinator_programs': 'Selecciona al menos un programa que coordina.',
                })
            if scope == CustomUser.CoordinatorScope.GENERAL and programs:
                raise serializers.ValidationError({
                    'coordinator_programs': 'Un coordinador general cubre todos los programas; no se le asignan.',
                })
        elif attrs.get('coordinator_scope') or attrs.get('coordinator_programs'):
            raise serializers.ValidationError({
                'coordinator_scope': 'Sólo los coordinadores tienen alcance y programas asignados.',
            })
        else:
            attrs['coordinator_scope']    = ''
            attrs['coordinator_programs'] = []

        return attrs


class AdminUserSerializer(CoordinatorScopeMixin, UserDataSerializer):
    """
    Hereda del serializador base de usuarios pero expone la cédula y la
    asignación de coordinador exclusivamente para el panel de administración.
    """
    coordinator_program_names = serializers.SerializerMethodField()
    enrollments = serializers.SerializerMethodField()

    class Meta(UserDataSerializer.Meta):
        fields = UserDataSerializer.Meta.fields + ('cedula', 'verification_status') + COORDINATOR_FIELDS + (
            'coordinator_program_names', 'enrollments',
        )
        read_only_fields = UserDataSerializer.Meta.read_only_fields + ('verification_status',)

    def get_coordinator_program_names(self, obj):
        """Nombres para pintar la tabla sin que el cliente cruce ids."""
        return [p.name for p in obj.coordinator_programs.all()]

    def get_enrollments(self, obj):
        """Programa y cohorte del bootcamper (#328).

        La clienta los agrupa mentalmente por cohorte, así que la tabla de
        usuarios tiene que decirlo. Se devuelve la lista completa —hay quien
        cursa más de un programa— y la interfaz decide cómo mostrarla; resolver
        acá cuál es "el" programa sería elegir por ella.

        Sale de Enrollment, la misma fuente que usa la cartera de Finanzas, para
        que las dos pantallas no digan cosas distintas del mismo bootcamper.
        """
        if obj.role != CustomUser.Role.BOOTCAMPER:
            return []

        return [
            {
                # CB-347: id de la inscripción — lo necesita el cliente para
                # poder pedir el cambio de cohorte de esta fila en concreto.
                'enrollment_id': str(enrollment.id),
                'program_id':    str(enrollment.bootcamp_id),
                'program_name':  enrollment.bootcamp.name,
                'cohort_id':     str(enrollment.cohort_id) if enrollment.cohort_id else None,
                'cohort_number': enrollment.cohort.number if enrollment.cohort else None,
                'cohort_status': enrollment.cohort.status if enrollment.cohort else None,
            }
            # Prefetch en UserViewSet.get_queryset: sin él esto sería un N+1 por fila.
            for enrollment in obj.enrollments.all()
        ]


class CreateUserSerializer(CoordinatorScopeMixin, serializers.ModelSerializer):
    # No `required=True`: si el administrador la deja en blanco, el usuario
    # recibe una invitación por correo para elegir su propia contraseña (issue
    # #295) en vez de que se la comuniquen en texto plano. El coordinador es la
    # única excepción real — no entra a la aplicación, así que ni siquiera se
    # le invita; `create_user` resuelve ambos casos.
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, style={'input_type': 'password'},
    )

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


class EnrollmentCohortUpdateSerializer(serializers.Serializer):
    """Body del PATCH que asigna o cambia la cohorte de una inscripción (CB-347).

    `cohort_id` es explícitamente nulleable (a diferencia de
    `ConvertLeadSerializer.cohort_id`, que sólo lo omite): hay que poder
    vaciar una cohorte asignada por error, no sólo asignar una nueva.
    """
    cohort_id = serializers.UUIDField(allow_null=True)





