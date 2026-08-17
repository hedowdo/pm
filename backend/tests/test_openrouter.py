import json
import os
import re
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.openrouter import (
    OPENROUTER_API_URL,
    OPENROUTER_MODEL,
    OpenRouterError,
    request_chat_completion,
)


def test_openrouter_request_and_response(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-secret")

    def respond(request: httpx2.Request) -> httpx2.Response:
        assert request.method == "POST"
        assert str(request.url) == OPENROUTER_API_URL
        assert request.headers["authorization"] == "Bearer test-secret"
        assert json.loads(request.content) == {
            "model": OPENROUTER_MODEL,
            "messages": [{"role": "user", "content": "What is 2+2?"}],
        }
        return httpx2.Response(
            200,
            json={"choices": [{"message": {"content": " 4 "}}]},
        )

    message = request_chat_completion(
        "What is 2+2?",
        transport=httpx2.MockTransport(respond),
    )

    assert message == "4"


def test_openrouter_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(OpenRouterError) as caught:
        request_chat_completion("Hello")

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
        request_chat_completion("Hello", transport=transport)

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
        request_chat_completion("Hello", transport=httpx2.MockTransport(time_out))

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
def test_openrouter_rejects_malformed_responses(
    monkeypatch: pytest.MonkeyPatch,
    response: httpx2.Response,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-secret")
    transport = httpx2.MockTransport(lambda _request: response)

    with pytest.raises(OpenRouterError) as caught:
        request_chat_completion("Hello", transport=transport)

    assert (caught.value.status_code, caught.value.detail) == (
        502,
        "AI service returned an invalid response",
    )


def test_chat_route_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": "Hello"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_chat_route_returns_message_and_validates_input(
    static_dir: Path,
    database_path: Path,
) -> None:
    received: list[str] = []

    def complete(message: str) -> str:
        received.append(message)
        return "Hello from the model"

    with TestClient(
        create_app(static_dir, database_path, chat_completion=complete),
    ) as client:
        client.post(
            "/api/auth/login",
            json={"username": "user", "password": "password"},
        )
        response = client.post("/api/chat", json={"message": "  Hello  "})
        malformed = client.post("/api/chat", json={"message": " "})

    assert response.status_code == 200
    assert response.json() == {"message": "Hello from the model"}
    assert received == ["Hello"]
    assert malformed.status_code == 400
    assert malformed.json() == {"detail": "Invalid request"}


@pytest.mark.live
def test_live_openrouter_chat_through_fastapi(
    static_dir: Path,
    database_path: Path,
) -> None:
    if os.environ.get("RUN_LIVE_OPENROUTER") != "1":
        pytest.skip("set RUN_LIVE_OPENROUTER=1 to call OpenRouter")

    with TestClient(create_app(static_dir, database_path)) as client:
        client.post(
            "/api/auth/login",
            json={"username": "user", "password": "password"},
        )
        response = client.post(
            "/api/chat",
            json={"message": "What is 2+2? Reply with only the number."},
        )

    assert response.status_code == 200, response.json()
    assert re.search(r"\b4\b", response.json()["message"])
