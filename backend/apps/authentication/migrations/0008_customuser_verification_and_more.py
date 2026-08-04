import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0007_alter_customuser_cedula'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='verification_status',
            field=models.CharField(
                max_length=25,
                choices=[
                    ('INVITED', 'Invitado'),
                    ('PENDING_VERIFICATION', 'Pendiente de verificación'),
                    ('VERIFIED', 'Verificado'),
                ],
                default='VERIFIED',
                verbose_name='Estado de verificación',
            ),
        ),
        migrations.AddField(
            model_name='customuser',
            name='verified_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='verified_bootcampers',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Verificado por',
            ),
        ),
        migrations.AddField(
            model_name='customuser',
            name='verified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='customuser',
            name='onboarding_completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='customuser',
            name='onboarding_token_issued_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
