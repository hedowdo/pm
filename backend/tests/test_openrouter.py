import json
from copy import deepcopy

import httpx2
import pytest

from app.ai import AssistantBoardResponse, ChatMessage
from app.database import SEED_BOARD_STATE
from app.models import BoardState
from app.openrouter import (
    OPENROUTER_API_URL,
    OPENROUTER_MODEL,
    OpenRouterError,
    request_board_completion,
)


def seed_board() -> BoardState:
    return BoardState.model_validate(deepcopy(SEED_BOARD_STATE))


def structured_content(
    message: str = "Done",
    operations: list[dict[str, object]] | None = None,
) -> str:
    items = operations or []
    return json.dumps(
        {
            "message": message,
            "operations": [json.dumps(item, separators=(",", ":")) for item in items],
        }
    )


def test_openrouter_structured_request_includes_board_and_conversation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-secret")
    board = seed_board()
    history = [
        ChatMessage(role="user", content="Earlier question"),
        ChatMessage(role="assistant", content="Earlier answer"),
    ]

    def respond(request: httpx2.Request) -> httpx2.Response:
        assert request.method == "POST"
        assert str(request.url) == OPENROUTER_API_URL
        assert request.headers["authorization"] == "Bearer test-secret"
        payload = json.loads(request.content)
        assert payload["model"] == OPENROUTER_MODEL
        assert payload["provider"] == {"require_parameters": True}
        assert board.model_dump_json(by_alias=True) in payload["messages"][0]["content"]
        assert payload["messages"][1:] == [
            {"role": "user", "content": "Earlier question"},
            {"role": "assistant", "content": "Earlier answer"},
            {"role": "user", "content": "Move the kickoff card"},
        ]
        response_format = payload["response_format"]
        assert response_format["type"] == "json_schema"
        assert response_format["json_schema"]["strict"] is True
        assert response_format["json_schema"]["name"] == "kanban_board_response"
        schema = response_format["json_schema"]["schema"]
        assert schema["additionalProperties"] is False
        assert schema["required"] == ["message", "operations"]
        assert "$defs" not in schema
        assert schema["properties"]["operations"]["items"] == {"type": "string"}
        return httpx2.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": structured_content("  Ready  ")}}
                ]
            },
        )

    result = request_board_completion(
        board,
        "Move the kickoff card",
        history,
        transport=httpx2.MockTransport(respond),
    )

    assert result == AssistantBoardResponse(message="Ready", operations=[])


def test_openrouter_converts_flat_provider_operations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-secret")
    content = structured_content(
        operations=[
            {
                "type": "create_card",
                "title": "Create this",
                "details": "New details",
                "columnId": "ideas",
                "position": 0,
            },
            {
                "type": "edit_card",
                "cardId": "card-brief",
                "title": "Edit this",
                "details": "Edited details",
            },
            {
                "type": "move_card",
                "cardId": "card-kickoff",
                "columnId": "done",
                "position": 1,
            },
        ]
    )
    transport = httpx2.MockTransport(
        lambda _request: httpx2.Response(
            200,
            json={"choices": [{"message": {"content": content}}]},
        )
    )

    result = request_board_completion(
        seed_board(),
        "Update cards",
        [],
        transport=transport,
    )

    assert [operation.type for operation in result.operations] == [
        "create_card",
        "edit_card",
        "move_card",
    ]
    assert result.operations[0].model_dump(by_alias=True) == {
        "type": "create_card",
        "title": "Create this",
        "details": "New details",
        "columnId": "ideas",
        "position": 0,
    }


def test_openrouter_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(OpenRouterError) as caught:
        request_board_completion(seed_board(), "Hello", [])

    assert (caught.value.status_code, caught.value.detail) == (
        503,
        "AI service is not configured",
    )


@pytest.mark.parametrize(
    ("provider_status", "expected_status", "expected_detail"),
    [
        (401, 502, "AI service authentication failed"),
        (403, 502, "AI service authentication failed"),
        (429, 503, "AI service is temporarily busy"),
        (500, 502, "AI service is unavailable"),
        (400, 502, "AI service rejected the request"),
    ],
)
def test_openrouter_maps_provider_errors(
    monkeypatch: pytest.MonkeyPatch,
    provider_status: int,
    expected_status: int,
    expected_detail: str,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-secret")
    transport = httpx2.MockTransport(
        lambda _request: httpx2.Response(
            provider_status,
            json={"error": {"message": "raw provider failure"}},
        ),
    )

    with pytest.raises(OpenRouterError) as caught:
        request_board_completion(seed_board(), "Hello", [], transport=transport)

    assert (caught.value.status_code, caught.value.detail) == (
        expected_status,
        expected_detail,
    )
    assert "raw provider failure" not in str(caught.value)


def test_openrouter_maps_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-secret")

    def time_out(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("provider took too long", request=request)

    with pytest.raises(OpenRouterError) as caught:
        request_board_completion(
            seed_board(),
            "Hello",
            [],
            transport=httpx2.MockTransport(time_out),
        )

    assert (caught.value.status_code, caught.value.detail) == (
        504,
        "AI service timed out",
    )


@pytest.mark.parametrize(
    "response",
    [
        httpx2.Response(200, content=b"not-json"),
        httpx2.Response(200, json={"choices": []}),
        httpx2.Response(200, json={"choices": [{"message": {}}]}),
        httpx2.Response(200, json={"choices": [{"message": {"content": " "}}]}),
    ],
)
def test_openrouter_rejects_malformed_provider_responses(
    monkeypatch: pytest.MonkeyPatch,
    response: httpx2.Response,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-secret")
    transport = httpx2.MockTransport(lambda _request: response)

    with pytest.raises(OpenRouterError) as caught:
        request_board_completion(seed_board(), "Hello", [], transport=transport)

    assert (caught.value.status_code, caught.value.detail) == (
        502,
        "AI service returned an invalid response",
    )


@pytest.mark.parametrize(
    "content",
    [
        "not-json",
        json.dumps({"message": "Done"}),
        structured_content(
            operations=[{"type": "delete_card", "cardId": "card-brief"}]
        ),
        structured_content(
            operations=[
                {
                    "type": "create_card",
                    "title": " ",
                    "details": "",
                    "columnId": "ideas",
                    "position": 0,
                }
            ]
        ),
        structured_content(
            operations=[
                {
                    "type": "move_card",
                    "cardId": "card-brief",
                    "columnId": "archive",
                    "position": 0,
                }
            ]
        ),
        structured_content(
            operations=[
                {
                    "type": "move_card",
                    "cardId": "card-brief",
                    "columnId": "done",
                    "position": -1,
                }
            ]
        ),
    ],
)
def test_openrouter_rejects_invalid_structured_output(
    monkeypatch: pytest.MonkeyPatch,
    content: str,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-secret")
    transport = httpx2.MockTransport(
        lambda _request: httpx2.Response(
            200,
            json={"choices": [{"message": {"content": content}}]},
        )
    )

    with pytest.raises(OpenRouterError) as caught:
        request_board_completion(seed_board(), "Hello", [], transport=transport)

    assert (caught.value.status_code, caught.value.detail) == (
        502,
        "AI service returned an invalid response",
    )
