import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('leads', '0007_alter_interaction_outcome_alter_lead_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='LeadAssignmentSetting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('self_assign_enabled', models.BooleanField(default=True, verbose_name='Auto-asignación habilitada')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL, verbose_name='Actualizado por')),
            ],
            options={
                'verbose_name': 'Configuración de auto-asignación de leads',
                'verbose_name_plural': 'Configuración de auto-asignación de leads',
            },
        ),
    ]
