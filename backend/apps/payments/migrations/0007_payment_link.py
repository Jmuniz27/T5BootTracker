import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0006_bootcamper_assignment_setting'),
        ('programs', '0007_enrollment_unique_per_cohort'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='payment_method',
            field=models.CharField(
                choices=[('TRANSFER', 'Transferencia'), ('LINK', 'Link de pago')],
                default='TRANSFER',
                max_length=10,
            ),
        ),
        migrations.CreateModel(
            name='PaymentLink',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('url', models.URLField(verbose_name='Enlace de pago')),
                ('amount', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True, verbose_name='Monto negociado')),
                ('note', models.CharField(blank=True, max_length=200, verbose_name='Concepto')),
                ('status', models.CharField(choices=[('ACTIVE', 'Activo'), ('EXPIRED', 'Expirado'), ('REVOKED', 'Revocado')], db_index=True, default='ACTIVE', max_length=10)),
                ('expires_at', models.DateTimeField(verbose_name='Expira el')),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_payment_links', to=settings.AUTH_USER_MODEL)),
                ('enrollment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payment_links', to='programs.enrollment')),
            ],
            options={
                'verbose_name': 'Enlace de pago',
                'verbose_name_plural': 'Enlaces de pago',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddField(
            model_name='payment',
            name='payment_link',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payments', to='payments.paymentlink'),
        ),
    ]
