"""Serializers for programs app."""
from rest_framework import serializers
from .models import Cohort, Program, CoordinatorEmailConfig
from .services import set_cohort_status


class CoordinatorEmailConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoordinatorEmailConfig
        fields = ('id', 'email', 'name', 'recipient_type', 'is_active', 'created_at')
        read_only_fields = ('id', 'created_at')


class CohortSerializer(serializers.ModelSerializer):
    """Lectura. `status_label` ahorra al cliente duplicar el mapa de estados."""
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Cohort
        fields = (
            'id', 'program', 'number', 'start_month', 'end_month',
            'status', 'status_label', 'created_at', 'updated_at',
        )
        read_only_fields = fields


class CohortWriteSerializer(serializers.ModelSerializer):
    """Escritura.

    `end_month` se acepta del cliente como **fin previsto**; al pasar a FINISHED
    el servicio lo resella con el mes real. `program` no es un campo — lo fija
    la vista desde la URL anidada.
    """

    class Meta:
        model = Cohort
        fields = ('number', 'start_month', 'end_month', 'status')

    def validate_number(self, value):
        if value < 1:
            raise serializers.ValidationError('El número de cohorte empieza en 1.')
        return value

    def validate(self, attrs):
        """Unicidad del número en el programa y coherencia de los dos meses.

        La unicidad no se puede delegar en UniqueTogetherValidator: `program` no
        es un campo del serializer, así que DRF no lo ve.
        """
        program = self.context.get('program') or getattr(self.instance, 'program', None)
        number  = attrs.get('number', getattr(self.instance, 'number', None))

        if program is not None and number is not None:
            clash = Cohort.objects.filter(program=program, number=number)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {'number': f'El programa ya tiene una cohorte {number}.'}
                )

        # Los ausentes se resuelven contra la instancia: un PATCH que sólo mueve
        # uno de los dos meses también tiene que quedar coherente.
        start = attrs.get('start_month', getattr(self.instance, 'start_month', None))
        end   = attrs.get('end_month',   getattr(self.instance, 'end_month', None))

        if start and end and end < start:
            raise serializers.ValidationError(
                {'end_month': 'El fin previsto no puede ser anterior al mes de inicio.'}
            )

        return attrs

    def create(self, validated_data):
        """No pasa por el servicio: al crear se respeta el fin previsto tal cual.

        Registrar una cohorte ya finalizada es legítimo (una edición histórica),
        y resellar el mes con el actual pisaría la fecha real que se tecleó. El
        resellado sólo tiene sentido en la transición hacia FINISHED, que ocurre
        en `update`.
        """
        cohort = Cohort(program=self.context['program'], **validated_data)
        cohort.save()
        return cohort

    def update(self, instance, validated_data):
        status = validated_data.pop('status', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)

        if status is not None and status != instance.status:
            return set_cohort_status(instance, status)

        instance.save()
        return instance


class ProgramSerializer(serializers.ModelSerializer):
    coordinator_emails = CoordinatorEmailConfigSerializer(many=True, read_only=True)
    # Anotado en la vista para no disparar un COUNT por programa.
    cohort_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Program
        fields = (
            'id', 'name', 'start_date', 'end_date',
            'total_cost', 'is_active', 'coordinator_emails', 'cohort_count', 'created_at',
        )
        read_only_fields = ('id', 'created_at')


class ProgramWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ('name', 'start_date', 'end_date', 'total_cost', 'is_active')

    def validate(self, attrs):
        if attrs.get('end_date') and attrs.get('start_date'):
            if attrs['end_date'] <= attrs['start_date']:
                raise serializers.ValidationError(
                    {'end_date': 'La fecha de fin debe ser posterior a la fecha de inicio.'}
                )
        return attrs
