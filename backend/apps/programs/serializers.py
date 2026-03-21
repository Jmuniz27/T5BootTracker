"""Serializers for programs app."""
from rest_framework import serializers
from .models import Program, CoordinatorEmailConfig


class CoordinatorEmailConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoordinatorEmailConfig
        fields = ('id', 'email', 'name', 'recipient_type', 'is_active', 'created_at')
        read_only_fields = ('id', 'created_at')


class ProgramSerializer(serializers.ModelSerializer):
    coordinator_emails = CoordinatorEmailConfigSerializer(many=True, read_only=True)

    class Meta:
        model = Program
        fields = (
            'id', 'name', 'start_date', 'end_date',
            'total_cost', 'is_active', 'coordinator_emails', 'created_at',
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
