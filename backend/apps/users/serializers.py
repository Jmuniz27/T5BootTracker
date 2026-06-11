from rest_framework import serializers
from apps.authentication.models import CustomUser
from apps.authentication.serializers import UserDataSerializer
from apps.authentication.validators import validate_cedula_ecuatoriana

class AdminUserSerializer(UserDataSerializer):
    """
    Hereda del serializador base de usuarios pero expone la cédula
    exclusivamente para el panel de administración.
    """
    class Meta(UserDataSerializer.Meta):
        fields = UserDataSerializer.Meta.fields + ('cedula',)


class CreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})

    class Meta:
        model = CustomUser
        fields = ['email', 'cedula', 'first_name', 'last_name', 'role', 'password', 'phone']

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






