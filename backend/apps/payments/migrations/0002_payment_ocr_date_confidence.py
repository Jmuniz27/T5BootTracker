# Generated manually for CB-49: add ocr_payment_date and ocr_confidence fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='ocr_payment_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='payment',
            name='ocr_confidence',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
