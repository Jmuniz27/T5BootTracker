from django.db import migrations


def contacted_to_interested(apps, schema_editor):
    """Migrate all leads with CONTACTED status to INTERESTED.

    CONTACTED is no longer a distinct status; first contact implies interest.
    """
    Lead = apps.get_model('leads', 'Lead')
    Lead.objects.filter(status='CONTACTED').update(status='INTERESTED')


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0005_alter_lead_status'),
    ]

    operations = [
        migrations.RunPython(contacted_to_interested, migrations.RunPython.noop),
    ]
