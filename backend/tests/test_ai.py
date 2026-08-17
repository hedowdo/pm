import os
import re
import sqlite3
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.ai import (
    AssistantBoardResponse,
    ChatMessage,
    apply_board_operations,
)
from app.database import SEED_BOARD_STATE, initialize_database, load_board
from app.main import create_app
from app.models import BoardState
from app.openrouter import OpenRouterError


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200


def raw_board(database_path: Path, username: str = "user") -> str:
    with sqlite3.connect(database_path) as connection:
        row = connection.execute(
            """
            SELECT b.state_json
            FROM boards AS b
            JOIN users AS u ON u.id = b.user_id
            WHERE u.username = ?
            """,
            (username,),
        ).fetchone()
    assert row is not None
    return row[0]


@pytest.mark.parametrize(
    ("operation", "expected"),
    [
        (
            {
                "type": "create_card",
                "title": "New card",
                "details": "Created by AI",
                "columnId": "ideas",
                "position": 1,
            },
            ("ideas", ["card-brief", "ai-card", "card-kickoff"]),
        ),
        (
            {
                "type": "edit_card",
                "cardId": "card-brief",
                "title": "Updated brief",
                "details": "Updated by AI",
            },
            ("title", "Updated brief"),
        ),
        (
            {
                "type": "move_card",
                "cardId": "card-brief",
                "columnId": "done",
                "position": 0,
            },
            ("done", ["card-brief", "card-demo"]),
        ),
    ],
)
def test_each_operation_type(
    operation: dict[str, object],
    expected: tuple[str, object],
) -> None:
    board = BoardState.model_validate(deepcopy(SEED_BOARD_STATE))
    assistant = AssistantBoardResponse(message="Done", operations=[operation])

    updated, applied = apply_board_operations(
        board,
        assistant.operations,
        lambda: "ai-card",
    )

    assert applied[0].type == operation["type"]
    if expected[0] == "title":
        card = next(card for card in updated.cards if card.id == "card-brief")
        assert card.title == expected[1]
    else:
        assert [
            card.id for card in updated.cards if card.column_id == expected[0]
        ] == expected[1]


def test_message_only_response_uses_history_without_saving(
    static_dir: Path,
    database_path: Path,
) -> None:
    received: list[tuple[BoardState, str, list[ChatMessage]]] = []

    def complete(
        board: BoardState,
        message: str,
        history: list[ChatMessage],
    ) -> AssistantBoardResponse:
        received.append((board, message, history))
        return AssistantBoardResponse(message="No board change needed", operations=[])

    with TestClient(
        create_app(static_dir, database_path, chat_completion=complete),
    ) as client:
        login(client)
        before = raw_board(database_path)
        response = client.post(
            "/api/chat",
            json={
                "message": "  Just answer this  ",
                "history": [
                    {"role": "user", "content": "Earlier question"},
                    {"role": "assistant", "content": "Earlier answer"},
                ],
            },
        )
        malformed = client.post(
            "/api/chat",
            json={
                "message": "Hello",
                "history": [{"role": "system", "content": "not allowed"}],
            },
        )

    assert response.status_code == 200
    assert response.json()["message"] == "No board change needed"
    assert response.json()["appliedOperations"] == []
    assert response.json()["board"] == SEED_BOARD_STATE
    assert raw_board(database_path) == before
    assert received[0][0].model_dump(by_alias=True) == SEED_BOARD_STATE
    assert received[0][1] == "Just answer this"
    assert [item.model_dump() for item in received[0][2]] == [
        {"role": "user", "content": "Earlier question"},
        {"role": "assistant", "content": "Earlier answer"},
    ]
    assert malformed.status_code == 400
    assert malformed.json() == {"detail": "Invalid request"}


def test_multi_operation_update_is_ordered_durable_and_user_isolated(
    static_dir: Path,
    database_path: Path,
) -> None:
    initialize_database(database_path)
    designer = deepcopy(SEED_BOARD_STATE)
    designer["columns"][0]["title"] = "Designer ideas"
    designer_state = BoardState.model_validate(designer)
    with sqlite3.connect(database_path) as connection:
        cursor = connection.execute(
            "INSERT INTO users (username) VALUES (?)",
            ("designer",),
        )
        connection.execute(
            "INSERT INTO boards (user_id, state_json) VALUES (?, ?)",
            (cursor.lastrowid, designer_state.model_dump_json(by_alias=True)),
        )

    assistant = AssistantBoardResponse.model_validate(
        {
            "message": "Updated the board",
            "operations": [
                {
                    "type": "create_card",
                    "title": "AI review",
                    "details": "Check the generated plan",
                    "columnId": "review",
                    "position": 1,
                },
                {
                    "type": "edit_card",
                    "cardId": "card-brief",
                    "title": "Share final brief",
                    "details": "Include the approved scope",
                },
                {
                    "type": "move_card",
                    "cardId": "card-kickoff",
                    "columnId": "done",
                    "position": 0,
                },
                {
                    "type": "move_card",
                    "cardId": "card-qa",
                    "columnId": "review",
                    "position": 0,
                },
                {
                    "type": "edit_card",
                    "cardId": "card-kickoff",
                    "title": "Kickoff complete",
                    "details": "The team is aligned",
                },
            ],
        }
    )

    def complete(
        _board: BoardState,
        _message: str,
        _history: list[ChatMessage],
    ) -> AssistantBoardResponse:
        return assistant

    with TestClient(
        create_app(
            static_dir,
            database_path,
            chat_completion=complete,
            card_id_factory=lambda: "ai-card",
        )
    ) as client:
        login(client)
        response = client.post("/api/chat", json={"message": "Update the project"})

    assert response.status_code == 200
    result = response.json()
    assert [item["type"] for item in result["appliedOperations"]] == [
        "create_card",
        "edit_card",
        "move_card",
        "move_card",
        "edit_card",
    ]
    assert result["appliedOperations"][0]["cardId"] == "ai-card"
    assert [
        card["id"] for card in result["board"]["cards"] if card["columnId"] == "review"
    ] == ["card-qa", "card-copy", "ai-card"]
    assert [
        card["id"] for card in result["board"]["cards"] if card["columnId"] == "done"
    ] == ["card-kickoff", "card-demo"]
    assert next(
        card for card in result["board"]["cards"] if card["id"] == "card-brief"
    )["title"] == "Share final brief"
    assert next(
        card for card in result["board"]["cards"] if card["id"] == "card-kickoff"
    )["title"] == "Kickoff complete"
    assert load_board(database_path, "user").model_dump(by_alias=True) == result["board"]
    assert load_board(database_path, "designer").columns[0].title == "Designer ideas"

    with sqlite3.connect(database_path) as connection:
        assert {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        } == {"users", "boards"}


@pytest.mark.parametrize(
    ("operations", "generated_id"),
    [
        (
            [
                {
                    "type": "edit_card",
                    "cardId": "unknown-card",
                    "title": "Unknown",
                    "details": "",
                }
            ],
            "ai-card",
        ),
        (
            [
                {
                    "type": "create_card",
                    "title": "Created",
                    "details": "",
                    "columnId": "ideas",
                    "position": 0,
                },
                {
                    "type": "move_card",
                    "cardId": "ai-card",
                    "columnId": "done",
                    "position": 0,
                },
            ],
            "ai-card",
        ),
        (
            [
                {
                    "type": "edit_card",
                    "cardId": "card-brief",
                    "title": "Would be valid",
                    "details": "",
                },
                {
                    "type": "move_card",
                    "cardId": "card-kickoff",
                    "columnId": "done",
                    "position": 99,
                },
            ],
            "ai-card",
        ),
        (
            [
                {
                    "type": "create_card",
                    "title": "Duplicate id",
                    "details": "",
                    "columnId": "ideas",
                    "position": 0,
                }
            ],
            "card-brief",
        ),
    ],
)
def test_invalid_operation_rolls_back_every_change(
    static_dir: Path,
    database_path: Path,
    operations: list[dict[str, object]],
    generated_id: str,
) -> None:
    assistant = AssistantBoardResponse.model_validate(
        {"message": "Attempted update", "operations": operations}
    )

    def complete(
        _board: BoardState,
        _message: str,
        _history: list[ChatMessage],
    ) -> AssistantBoardResponse:
        return assistant

    with TestClient(
        create_app(
            static_dir,
            database_path,
            chat_completion=complete,
            card_id_factory=lambda: generated_id,
        )
    ) as client:
        login(client)
        before = raw_board(database_path)
        response = client.post("/api/chat", json={"message": "Change the board"})

    assert response.status_code == 502
    assert response.json() == {"detail": "AI response could not be applied"}
    assert raw_board(database_path) == before


def test_provider_failure_after_board_load_makes_no_change(
    static_dir: Path,
    database_path: Path,
) -> None:
    loaded = False

    def fail(
        board: BoardState,
        _message: str,
        _history: list[ChatMessage],
    ) -> AssistantBoardResponse:
        nonlocal loaded
        loaded = board.cards[0].id == "card-brief"
        raise OpenRouterError(504, "AI service timed out")

    with TestClient(
        create_app(static_dir, database_path, chat_completion=fail),
    ) as client:
        login(client)
        before = raw_board(database_path)
        response = client.post("/api/chat", json={"message": "Change the board"})

    assert loaded is True
    assert response.status_code == 504
    assert response.json() == {"detail": "AI service timed out"}
    assert raw_board(database_path) == before


def test_chat_route_requires_authentication(
    static_dir: Path,
    database_path: Path,
) -> None:
    called = False

    def complete(
        _board: BoardState,
        _message: str,
        _history: list[ChatMessage],
    ) -> AssistantBoardResponse:
        nonlocal called
        called = True
        return AssistantBoardResponse(message="No", operations=[])

    with TestClient(
        create_app(static_dir, database_path, chat_completion=complete),
    ) as client:
        response = client.post("/api/chat", json={"message": "Hello"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}
    assert called is False


@pytest.mark.live
def test_live_strict_schema_through_fastapi(
    static_dir: Path,
    database_path: Path,
) -> None:
    if os.environ.get("RUN_LIVE_OPENROUTER") != "1":
        pytest.skip("set RUN_LIVE_OPENROUTER=1 to call OpenRouter")

    with TestClient(create_app(static_dir, database_path)) as client:
        login(client)
        before = client.get("/api/board").json()
        response = client.post(
            "/api/chat",
            json={
                "message": (
                    "What is 2+2? State the answer and return no board operations."
                )
            },
        )
        after = client.get("/api/board").json()

    assert response.status_code == 200, response.json()
    assert re.search(r"\b4\b", response.json()["message"])
    assert response.json()["appliedOperations"] == []
    assert response.json()["board"] == before
    assert after == before


@pytest.mark.live
def test_live_ai_create_persists_through_fastapi(
    static_dir: Path,
    database_path: Path,
) -> None:
    if os.environ.get("RUN_LIVE_OPENROUTER") != "1":
        pytest.skip("set RUN_LIVE_OPENROUTER=1 to call OpenRouter")

    with TestClient(create_app(static_dir, database_path)) as client:
        login(client)
        response = client.post(
            "/api/chat",
            json={
                "message": (
                    "Create exactly one card titled 'Live verification card' with "
                    "details 'Temporary integration check' at position 0 in Ideas."
                )
            },
        )
        saved = client.get("/api/board").json()

    assert response.status_code == 200, response.json()
    assert [item["type"] for item in response.json()["appliedOperations"]] == [
        "create_card"
    ]
    created = next(
        card for card in saved["cards"] if card["title"] == "Live verification card"
    )
    assert created["details"] == "Temporary integration check"
    assert created["columnId"] == "ideas"
    assert [
        card["id"] for card in saved["cards"] if card["columnId"] == "ideas"
    ][0] == created["id"]
    assert response.json()["board"] == saved
