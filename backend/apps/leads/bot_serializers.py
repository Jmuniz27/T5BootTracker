"""Serializers for the WhatsApp bot integration surface (#279).

Las claves de entrada son las del bot, no las del modelo: manda `program` y aquí
se mapea a `program_interest`. Así el contrato del bot no depende de cómo se
llame el campo en la base, y no hay que editar el workflow si el modelo cambia.

El bot tampoco decide `source`, `status` ni `owner`: los fija el backend, porque
son consecuencia de por dónde entró el lead, no algo que el llamador elija.
"""
from rest_framework import serializers

from .models import Lead


class BotLeadCreateSerializer(serializers.ModelSerializer):
    program = serializers.CharField(
        source='program_interest',
        max_length=200,
        required=False,
        allow_blank=True,
        default='',
    )

    class Meta:
        model = Lead
        fields = ('phone', 'name', 'email', 'program')
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

    class Meta:
        model = Lead
        fields = ('name', 'email', 'program')
        extra_kwargs = {
            'name': {'required': False},
            'email': {'required': False, 'allow_null': True, 'allow_blank': True},
        }
