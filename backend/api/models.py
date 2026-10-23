import uuid

from django.db import models


class Conversation(models.Model):
    class Mode(models.TextChoices):
        GLOBAL = "global", "Global"
        ITEM = "item", "Item"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item_id = models.CharField(max_length=24, db_index=True)
    mode = models.CharField(max_length=8, choices=Mode.choices, default=Mode.GLOBAL, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]


class ChatTurn(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="turns")
    request_id = models.UUIDField(unique=True)
    # NULL identifies legacy turns whose context lived on Conversation.
    observed_item_id = models.CharField(max_length=24, blank=True, null=True, default=None)
    question = models.TextField()
    allow_external = models.BooleanField(default=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROCESSING)
    result = models.JSONField(default=dict)
    error_code = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [models.UniqueConstraint(
            fields=["conversation"], condition=models.Q(status="processing"),
            name="one_processing_turn_per_chat",
        )]
