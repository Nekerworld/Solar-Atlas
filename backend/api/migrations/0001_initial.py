import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="Conversation",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("item_id", models.CharField(db_index=True, max_length=24)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["-updated_at", "-id"]},
        ),
        migrations.CreateModel(
            name="ChatTurn",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("request_id", models.UUIDField(unique=True)),
                ("question", models.TextField()),
                ("allow_external", models.BooleanField(default=True)),
                ("status", models.CharField(choices=[("processing", "Processing"), ("completed", "Completed"), ("failed", "Failed")], default="processing", max_length=16)),
                ("result", models.JSONField(default=dict)),
                ("error_code", models.CharField(blank=True, max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("conversation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="turns", to="api.conversation")),
            ],
            options={"ordering": ["-created_at", "-id"], "constraints": [
                models.UniqueConstraint(condition=models.Q(status="processing"), fields=("conversation",), name="one_processing_turn_per_chat"),
            ]},
        ),
    ]
