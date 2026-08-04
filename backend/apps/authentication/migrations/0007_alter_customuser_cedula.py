from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0006_customuser_finance_assigned_at_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='customuser',
            name='cedula',
            field=models.CharField(max_length=13, null=True, blank=True, unique=True, verbose_name='Cédula'),
        ),
    ]
