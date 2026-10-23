from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0002_chatturn_observed_item_id")]
    operations = [migrations.AddField(
        model_name="conversation", name="mode",
        field=models.CharField(choices=[("global", "Global"), ("item", "Item")], db_index=True, default="global", max_length=8),
    )]
