"""Agrega COHORT_CHANGED a Interaction.Outcome (CB-347).

Sólo actualiza las choices declaradas en el modelo; la columna ya era un
CharField(max_length=30) sin constraint de choices a nivel de base de datos,
así que no hay nada que tocar en el esquema real.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0014_interaction_lead_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='interaction',
            name='outcome',
            field=models.CharField(choices=[('CALL_AGAIN', 'Llamar de nuevo'), ('SEND_INFO', 'Enviar información'), ('SCHEDULE_VISIT', 'Agendar visita'), ('AWAIT_REPLY', 'Esperar respuesta'), ('SPEAK_COORDINATOR', 'Hablar con coordinador'), ('REASSIGNED', 'Reasignado por administrador'), ('DISCARDED', 'Descartado'), ('RESTORED', 'Reactivado'), ('COHORT_CHANGED', 'Cohorte modificada')], max_length=30),
        ),
    ]
