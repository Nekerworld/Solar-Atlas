from django.shortcuts import get_object_or_404
from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.renderers import JSONRenderer
from rest_framework.views import APIView

from .chat_service import ChatError, submit_chat
from .models import Conversation
from .serializers import (ChatRequestSerializer, ChatTurnSerializer,
                          ConversationFilterSerializer, ConversationSerializer)


class ChatPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


@api_view(["GET"])
def health_check(request):
    return Response({"status": "ok", "message": "Django API가 정상 작동합니다."})


@api_view(["POST"])
def chat(request):
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        payload, status = submit_chat(serializer.validated_data)
    except ChatError as error:
        return Response(error.payload, status=error.status)
    return Response(payload, status=status)


class StreamContentNegotiation(DefaultContentNegotiation):
    def select_renderer(self, request, renderers, format_suffix=None):
        # Successful streams supply their own text/event-stream response. DRF
        # still needs a renderer for validation errors before the stream opens.
        # Accept SSE without rejecting it against the JSON error renderer.
        return renderers[0], renderers[0].media_type


class ChatStreamView(APIView):
    content_negotiation_class = StreamContentNegotiation
    renderer_classes = [JSONRenderer]

    def post(self, request):
        from .chat_stream import stream_response
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return stream_response(serializer.validated_data)


chat_stream = ChatStreamView.as_view()


@api_view(["GET"])
def celestial_objects(request):
    from rag.config import IndexConfig
    from rag.dataset import read_json
    from rag.store import ChromaStore

    try:
        config = IndexConfig.from_django()
        items = read_json(config.data_dir / "celestial_objects.json")
        try:
            store = ChromaStore(config, create=False)
            indexed = set(store.profiles.get(include=[])["ids"])
        except (ValueError, OSError, RuntimeError):
            indexed = set()
        return Response({"items": [{"item_id": item["id"], "name_ko": item["name_ko"],
                                    "name_en": item.get("name_en"), "type": item["type"],
                                    "parent_id": item.get("parent_id"), "indexed": item["id"] in indexed}
                                   for item in items]})
    except (ValueError, OSError, ImportError):
        return Response({"error": {"code": "items_unavailable", "message": "천체 목록을 불러올 수 없습니다."}}, status=503)


@api_view(["GET"])
def conversations(request):
    filters = ConversationFilterSerializer(data=request.query_params)
    filters.is_valid(raise_exception=True)
    queryset = Conversation.objects.all()
    if filters.validated_data.get("mode"):
        queryset = queryset.filter(mode=filters.validated_data["mode"])
    if filters.validated_data.get("item_id"):
        key = filters.validated_data["item_id"]
        queryset = queryset.filter(Q(item_id=key) | Q(turns__observed_item_id=key)).distinct()
    pagination = ChatPagination()
    page = pagination.paginate_queryset(queryset, request)
    return pagination.get_paginated_response(ConversationSerializer(page, many=True).data)


@api_view(["GET"])
def conversation_detail(request, conversation_id):
    conversation = get_object_or_404(Conversation, id=conversation_id)
    return Response(ConversationSerializer(conversation).data)


@api_view(["GET"])
def conversation_turns(request, conversation_id):
    conversation = get_object_or_404(Conversation, id=conversation_id)
    pagination = ChatPagination()
    page = pagination.paginate_queryset(conversation.turns.all(), request)
    return pagination.get_paginated_response(ChatTurnSerializer(page, many=True).data)
