import os

import httpx2
from pydantic import ValidationError

from app.ai import (
    ASSISTANT_RESPONSE_SCHEMA,
    AssistantBoardResponse,
    ChatMessage,
    ProviderBoardResponse,
)
from app.models import BoardState


OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-20b:free"
OPENROUTER_TIMEOUT_SECONDS = 45.0


class OpenRouterError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def request_board_completion(
    board: BoardState,
    message: str,
    history: list[ChatMessage],
    *,
    transport: httpx2.BaseTransport | None = None,
) -> AssistantBoardResponse:
    board_json = board.model_dump_json(by_alias=True)
    system_message = (
        "You are the AI assistant for a Kanban board. Return only the requested "
        "structured response. You may create, edit, or move cards. You may not "
        "delete cards or change columns. Positions are zero-based within the target "
        "column. For a same-column move, evaluate the position after removing the "
        "moving card. Apply operations in listed order. Edit and move operations may "
        "reference only card IDs in the board below; never reference a card created "
        "in the same response. A create operation already places its card. Use no "
        "operations when a board change is not requested. Each item in the operations "
        "array must be a JSON string containing exactly one operation object. A "
        "create_card object has type, title, details, columnId, and position. An "
        "edit_card object has type, cardId, title, and details. A move_card object has "
        "type, cardId, columnId, and position. Include no other fields. Return an empty "
        "operations array when no operation is needed. Your entire response must be "
        "one JSON object in this exact outer form, with no prose or Markdown outside "
        'it: {"message":"your reply","operations":[]}. For an operation, each array '
        "item is a JSON-encoded string, not a nested object.\n\n"
        f"Authoritative board JSON:\n{board_json}"
    )
    messages = [
        {"role": "system", "content": system_message},
        *(item.model_dump() for item in history),
        {"role": "user", "content": message},
    ]
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "provider": {"require_parameters": True},
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "kanban_board_response",
                "strict": True,
                "schema": ASSISTANT_RESPONSE_SCHEMA,
            },
        },
    }
    content = _request_completion(payload, transport=transport)

    try:
        provider_response = ProviderBoardResponse.model_validate_json(content)
        return provider_response.to_assistant_response()
    except ValidationError:
        raise OpenRouterError(502, "AI service returned an invalid response") from None


def _request_completion(
    payload: dict[str, object],
    *,
    transport: httpx2.BaseTransport | None = None,
) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise OpenRouterError(503, "AI service is not configured")

    try:
        with httpx2.Client(
            timeout=OPENROUTER_TIMEOUT_SECONDS,
            transport=transport,
        ) as client:
            response = client.post(
                OPENROUTER_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx2.TimeoutException:
        raise OpenRouterError(504, "AI service timed out") from None
    except httpx2.RequestError:
        raise OpenRouterError(502, "AI service is unavailable") from None

    if response.status_code in (401, 403):
        raise OpenRouterError(502, "AI service authentication failed")
    if response.status_code == 429:
        raise OpenRouterError(503, "AI service is temporarily busy")
    if response.status_code >= 500:
        raise OpenRouterError(502, "AI service is unavailable")
    if response.status_code >= 400:
        raise OpenRouterError(502, "AI service rejected the request")

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError):
        raise OpenRouterError(502, "AI service returned an invalid response") from None

    if not isinstance(content, str) or not content.strip():
        raise OpenRouterError(502, "AI service returned an invalid response")
    return content.strip()
