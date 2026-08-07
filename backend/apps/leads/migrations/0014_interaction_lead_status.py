"""Sella el estado del lead en cada interacción (#325).

Sobre el backfill
-----------------
Sólo se rellena la **última** interacción de cada lead, porque es la única para
la que el estado actual del lead es un dato y no una suposición: nada ocurrió
después de ella.

Las anteriores quedan en NULL a propósito. Rellenarlas todas con el estado de
hoy pintaría un historial plano —"siempre estuvo INTERESTED"— que es justo la
mentira que este campo viene a evitar: la pantalla muestra la evolución, y una
evolución inventada es peor que un hueco declarado. La interfaz las muestra como
"sin registro".
"""

from django.db import migrations, models


def sellar_ultima_interaccion(apps, schema_editor):
    Interaction = apps.get_model('leads', 'Interaction')
    Lead = apps.get_model('leads', 'Lead')

    # Una consulta por lead sería un N+1 sobre toda la tabla; se resuelve con un
    # mapa de estados y una sola pasada por las últimas interacciones.
    estados = dict(Lead.objects.values_list('id', 'status'))

    ultimas = []
    vistos = set()
    for interaccion in Interaction.objects.order_by('lead_id', '-created_at').only('id', 'lead_id'):
        if interaccion.lead_id in vistos:
            continue
        vistos.add(interaccion.lead_id)
        estado = estados.get(interaccion.lead_id)
        if estado:
            interaccion.lead_status = estado
            ultimas.append(interaccion)

    if ultimas:
        Interaction.objects.bulk_update(ultimas, ['lead_status'], batch_size=500)


def revertir(apps, schema_editor):
    """El campo se elimina con el RemoveField; no hay nada que deshacer acá."""


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0013_lead_discard_detail_lead_discard_reason_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='interaction',
            name='lead_status',
            field=models.CharField(blank=True, choices=[('NEW', 'Nuevo'), ('QUALIFIED', 'Calificado'), ('INTERESTED', 'Interesado'), ('NOT_INTERESTED', 'No interesado'), ('CONVERTED', 'Convertido'), ('DISCARDED', 'Descartado')], max_length=20, null=True, verbose_name='Estado del lead tras la interacción'),
        ),
        migrations.RunPython(sellar_ultima_interaccion, revertir),
    ]
