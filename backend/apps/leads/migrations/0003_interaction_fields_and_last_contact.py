import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0002_lead_program_fk'),
    ]

    operations = [
        migrations.AddField(
            model_name='lead',
            name='last_contact',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Último contacto'),
        ),
        migrations.AddField(
            model_name='interaction',
            name='duration_minutes',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='interaction',
            name='next_action',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='interaction',
            name='next_action_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='interaction',
            name='interaction_type',
            field=models.CharField(
                choices=[
                    ('CALL', 'Llamada'),
                    ('WHATSAPP', 'WhatsApp'),
                    ('EMAIL', 'Email'),
                    ('VISIT', 'Visita'),
                    ('NOTE', 'Nota'),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='interaction',
            name='interest_level',
            field=models.IntegerField(
                blank=True,
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(5),
                ],
            ),
        ),
    ]
