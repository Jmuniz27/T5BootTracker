# Merge migration: une la rama 0007_payment_deleted_at_payment_deleted_by_paymentplan
# (soft-delete + PaymentPlan) con 0007_payment_link (CR-013, PaymentLink), creadas en
# paralelo por dos PRs distintos.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0007_payment_deleted_at_payment_deleted_by_paymentplan'),
        ('payments', '0007_payment_link'),
    ]

    operations = [
    ]
