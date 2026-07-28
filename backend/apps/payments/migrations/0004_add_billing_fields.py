# Generated manually for CB-123: add structured billing fields (CR-009)

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("payments", "0003_add_draft_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="payment",
            name="payer_name",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="payment",
            name="payer_identification",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="payment",
            name="payer_email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="payment",
            name="payer_address",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="payment",
            name="payer_phone",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="payment",
            name="document_number",
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
