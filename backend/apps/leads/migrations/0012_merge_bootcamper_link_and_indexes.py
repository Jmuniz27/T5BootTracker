"""Une las dos ramas 0011 de `leads`.

Se abrieron en paralelo: PERF-1 (#193) añadió índices alterando campos, y este
trabajo añadió `Lead.bootcamper`. No hay conflicto de contenido — tocan campos
distintos — sólo dos hojas en el grafo, y Django exige una sola. Sin operaciones
a propósito: es únicamente el punto de unión.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0011_alter_lead_created_at_alter_lead_deleted_at_and_more'),
        ('leads', '0011_lead_bootcamper_link'),
    ]

    operations = [
    ]
