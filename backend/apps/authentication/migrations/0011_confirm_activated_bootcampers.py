from django.db import migrations


def confirm_activated(apps, schema_editor):
    """Se eliminó el paso manual de verificación: activar la cuenta es la
    confirmación. Los bootcampers que ya activaron (PENDING_VERIFICATION) o que
    quedaron RECHAZADOS pasan a VERIFIED ('Cuenta activa'), que es el estado
    único post-activación en el modelo nuevo."""
    CustomUser = apps.get_model('authentication', 'CustomUser')
    CustomUser.objects.filter(
        verification_status__in=['PENDING_VERIFICATION', 'REJECTED'],
    ).update(verification_status='VERIFIED')


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0010_customuser_data_consent_at_and_more'),
    ]

    operations = [
        migrations.RunPython(confirm_activated, migrations.RunPython.noop),
    ]
