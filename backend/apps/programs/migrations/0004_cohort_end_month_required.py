"""`Cohort.end_month` pasa a obligatorio, con el sentido de fin previsto.

Se escribe a mano porque el autodetector no puede endurecer la columna sin
saber qué poner en las filas que ya existen: primero se rellenan, después se
altera. En el orden inverso la migración falla contra cualquier base con
cohortes en curso.
"""

from django.db import migrations, models


def fill_missing_end_month(apps, schema_editor):
    """Rellena las cohortes sin fin previsto usando la fecha de fin del programa.

    Es el mejor dato disponible: hasta ahora el rango de los pagos salía justo
    de ahí. Si por lo que sea quedara antes del inicio, se usa el inicio para no
    dejar un rango invertido.
    """
    Cohort = apps.get_model('programs', 'Cohort')

    for cohort in Cohort.objects.filter(end_month__isnull=True).select_related('program'):
        candidate = cohort.program.end_date.replace(day=1)
        cohort.end_month = max(candidate, cohort.start_month)
        cohort.save(update_fields=['end_month'])


class Migration(migrations.Migration):

    dependencies = [
        ('programs', '0003_cohort'),
    ]

    operations = [
        migrations.RunPython(fill_missing_end_month, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='cohort',
            name='end_month',
            field=models.DateField(verbose_name='Mes de fin previsto'),
        ),
    ]
