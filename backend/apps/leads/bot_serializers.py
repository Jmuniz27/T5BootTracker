"""Serializers for the WhatsApp bot integration surface (#279).

Las claves de entrada son las del bot, no las del modelo: manda `program` y aquí
se mapea a `program_interest`. Así el contrato del bot no depende de cómo se
llame el campo en la base, y no hay que editar el workflow si el modelo cambia.

El bot tampoco decide `source`, `status` ni `owner`: los fija el backend, porque
son consecuencia de por dónde entró el lead, no algo que el llamador elija.

`program_id` (CB-84) llega cuando la persona eligió de la lista del catálogo, y
permite vincular la FK por id en vez de cruzando el nombre. Es opcional porque
la rama de texto libre no lo tiene: ahí sólo se sabe lo que la persona escribió.
"""
from rest_framework import serializers

from .models import Lead


class BlankableUUIDField(serializers.UUIDField):
    """UUID que además acepta cadena vacía como "no vino".

    El nodo HTTP de Jelou arma el cuerpo interpolando una plantilla, y una
    variable de memoria sin valor se interpola como `""`, no como `null` ni
    omitiendo la clave. Sin esto, cada lead que responde por texto libre —el
    caso en el que no hay id de programa— fallaría con un 400.
    """

    def to_internal_value(self, data):
        if data in ('', None):
            return None
        return super().to_internal_value(data)


class BotLeadCreateSerializer(serializers.ModelSerializer):
    program = serializers.CharField(
        source='program_interest',
        max_length=200,
        required=False,
        allow_blank=True,
        default='',
    )
    program_id = BlankableUUIDField(required=False, allow_null=True, default=None)

    class Meta:
        model = Lead
        fields = ('phone', 'name', 'email', 'program', 'program_id')
        extra_kwargs = {
            'email': {'required': False, 'allow_null': True, 'allow_blank': True},
        }


class BotLeadUpdateSerializer(serializers.ModelSerializer):
    program = serializers.CharField(
        source='program_interest',
        max_length=200,
        required=False,
        allow_blank=True,
    )
    program_id = BlankableUUIDField(required=False, allow_null=True)

    class Meta:
        model = Lead
        fields = ('name', 'email', 'program', 'program_id')
        extra_kwargs = {
            'name': {'required': False},
            'email': {'required': False, 'allow_null': True, 'allow_blank': True},
        }
