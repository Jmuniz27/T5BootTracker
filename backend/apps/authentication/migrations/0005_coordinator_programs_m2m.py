"""Un coordinador pasa de cubrir un programa a cubrir varios.

El orden importa: la migración autogenerada borraba la FK antes de crear el
M2M, lo que perdía las asignaciones existentes. Aquí se crea el M2M primero,
se copian los datos, y sólo entonces se borra la columna vieja.
"""

from django.db import migrations, models


def copy_program_to_programs(apps, schema_editor):
    """Lleva la asignación única de cada coordinador al nuevo M2M."""
    CustomUser = apps.get_model('authentication', 'CustomUser')

    for user in CustomUser.objects.exclude(coordinator_program__isnull=True):
        user.coordinator_programs.add(user.coordinator_program)


def copy_programs_back(apps, schema_editor):
    """Vuelta atrás: se conserva el primer programa, el único que cabe en la FK.

    Un coordinador con varios programas pierde el resto — es inevitable al
    volver a una relación uno-a-uno, y se prefiere eso a fallar el rollback.
    """
    CustomUser = apps.get_model('authentication', 'CustomUser')

    for user in CustomUser.objects.all():
        first = user.coordinator_programs.first()
        if first is not None:
            user.coordinator_program = first
            user.save(update_fields=['coordinator_program'])


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0004_customuser_coordinator_program_and_more'),
        ('programs', '0002_enrollment'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='coordinator_programs',
            field=models.ManyToManyField(
                blank=True,
                related_name='coordinator_users',
                to='programs.program',
                verbose_name='Programas asignados',
            ),
        ),
        migrations.RunPython(copy_program_to_programs, copy_programs_back),
        migrations.RemoveField(
            model_name='customuser',
            name='coordinator_program',
        ),
    ]
