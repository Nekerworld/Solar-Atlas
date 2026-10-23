import uuid

from rest_framework import serializers

from .models import ChatTurn, Conversation


class ChatRequestSerializer(serializers.Serializer):
    item_id = serializers.RegexField(r"^Q[1-9][0-9]*$", max_length=24, required=False, allow_blank=True, default="")
    question = serializers.CharField(max_length=2000, trim_whitespace=True)
    conversation_id = serializers.UUIDField(required=False, allow_null=True)
    request_id = serializers.UUIDField(default=uuid.uuid4)
    allow_external = serializers.BooleanField(default=True)
    mode = serializers.ChoiceField(choices=Conversation.Mode.choices, default=Conversation.Mode.GLOBAL)

    def validate(self, data):
        if data["mode"] == Conversation.Mode.ITEM and not data["item_id"]:
            raise serializers.ValidationError({"item_id": "천체 전용 대화에는 천체 ID가 필요합니다."})
        return data


class ConversationFilterSerializer(serializers.Serializer):
    item_id = serializers.RegexField(r"^Q[1-9][0-9]*$", required=False, max_length=24)
    mode = serializers.ChoiceField(choices=Conversation.Mode.choices, required=False)


class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ["id", "item_id", "mode", "created_at", "updated_at"]


class ChatTurnSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatTurn
        fields = ["id", "conversation_id", "request_id", "observed_item_id", "question", "allow_external",
                  "status", "result", "error_code", "created_at", "finished_at"]
