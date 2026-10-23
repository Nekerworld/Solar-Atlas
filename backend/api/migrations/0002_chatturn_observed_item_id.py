from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0001_initial")]
    operations = [migrations.AddField(
        model_name="chatturn", name="observed_item_id",
        field=models.CharField(blank=True, default=None, max_length=24, null=True),
    )]
