import json
import sqlite3
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import (
    BoardStoreError,
    SEED_BOARD_STATE,
    initialize_database,
    load_board,
    replace_board,
)
from app.models import BoardState


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


def test_database_initializes_seed_and_is_idempotent(database_path: Path) -> None:
    initialize_database(database_path)

    with sqlite3.connect(database_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        users = connection.execute("SELECT id, username FROM users").fetchall()
        boards = connection.execute("SELECT id, user_id FROM boards").fetchall()

    assert tables == {"users", "boards"}
    assert users == [(1, "user")]
    assert boards == [(1, 1)]
    assert load_board(database_path, "user").model_dump(by_alias=True) == SEED_BOARD_STATE

    changed = deepcopy(SEED_BOARD_STATE)
    changed["columns"][0]["title"] = "Discovery"
    replace_board(database_path, "user", BoardState.model_validate(changed))
    initialize_database(database_path)

    assert load_board(database_path, "user").columns[0].title == "Discovery"


def test_authenticated_whole_board_round_trip_preserves_operations(
    client: TestClient,
    database_path: Path,
) -> None:
    login(client)
    initial = client.get("/api/board")
    assert initial.status_code == 200
    state = initial.json()

    state["columns"][0]["title"] = "  Discovery  "
    state["cards"] = [
        card
        for card in state["cards"]
        if card["id"] not in {"card-brief", "card-demo"}
    ]
    kickoff = next(card for card in state["cards"] if card["id"] == "card-kickoff")
    kickoff["title"] = "  Host project kickoff  "
    kickoff["details"] = "  Confirm the agenda.  "

    story = next(card for card in state["cards"] if card["id"] == "card-story")
    state["cards"].remove(story)
    audience_index = next(
        index for index, card in enumerate(state["cards"]) if card["id"] == "card-audience"
    )
    state["cards"].insert(audience_index, story)

    homepage = next(card for card in state["cards"] if card["id"] == "card-homepage")
    state["cards"].remove(homepage)
    homepage["columnId"] = "review"
    copy_index = next(
        index for index, card in enumerate(state["cards"]) if card["id"] == "card-copy"
    )
    state["cards"].insert(copy_index, homepage)

    qa = next(card for card in state["cards"] if card["id"] == "card-qa")
    state["cards"].remove(qa)
    qa["columnId"] = "done"
    state["cards"].append(qa)
    state["cards"].append(
        {
            "id": "  card-new  ",
            "title": "  Prepare update  ",
            "details": "  Include the latest decisions.  ",
            "columnId": "ideas",
        }
    )

    saved = client.put("/api/board", json=state)

    assert saved.status_code == 200
    canonical = saved.json()
    assert canonical["columns"][0]["title"] == "Discovery"
    assert {card["id"] for card in canonical["cards"]}.isdisjoint(
        {"card-brief", "card-demo"}
    )
    assert next(card for card in canonical["cards"] if card["id"] == "card-kickoff") == {
        "id": "card-kickoff",
        "title": "Host project kickoff",
        "details": "Confirm the agenda.",
        "columnId": "ideas",
    }
    assert [
        card["id"] for card in canonical["cards"] if card["columnId"] == "todo"
    ][:2] == ["card-story", "card-audience"]
    assert [
        card["id"] for card in canonical["cards"] if card["columnId"] == "review"
    ][:2] == ["card-homepage", "card-copy"]
    assert [card["id"] for card in canonical["cards"] if card["columnId"] == "done"] == [
        "card-qa"
    ]
    assert next(card for card in canonical["cards"] if card["id"] == "card-new")[
        "details"
    ] == "Include the latest decisions."
    assert client.get("/api/board").json() == canonical
    assert load_board(database_path, "user").model_dump(by_alias=True) == canonical


def test_invalid_replacements_leave_stored_json_unchanged(
    client: TestClient,
    database_path: Path,
) -> None:
    login(client)
    original = client.get("/api/board").json()
    invalid_states: list[tuple[str, object]] = []

    missing_column = deepcopy(original)
    missing_column["columns"].pop()
    invalid_states.append(("missing column", missing_column))

    extra_column = deepcopy(original)
    extra_column["columns"].append({"id": "archive", "title": "Archive"})
    invalid_states.append(("extra column", extra_column))

    reordered_columns = deepcopy(original)
    reordered_columns["columns"][0], reordered_columns["columns"][1] = (
        reordered_columns["columns"][1],
        reordered_columns["columns"][0],
    )
    invalid_states.append(("reordered columns", reordered_columns))

    blank_column = deepcopy(original)
    blank_column["columns"][0]["title"] = "   "
    invalid_states.append(("blank column title", blank_column))

    duplicate_card = deepcopy(original)
    duplicate_card["cards"][1]["id"] = duplicate_card["cards"][0]["id"]
    invalid_states.append(("duplicate card id", duplicate_card))

    blank_card = deepcopy(original)
    blank_card["cards"][0]["title"] = "   "
    invalid_states.append(("blank card title", blank_card))

    unknown_column = deepcopy(original)
    unknown_column["cards"][0]["columnId"] = "archive"
    invalid_states.append(("unknown card column", unknown_column))

    malformed_details = deepcopy(original)
    malformed_details["cards"][0]["details"] = 42
    invalid_states.append(("non-string details", malformed_details))

    extra_field = deepcopy(original)
    extra_field["cards"][0]["priority"] = "high"
    invalid_states.append(("extra card field", extra_field))

    non_array_cards = deepcopy(original)
    non_array_cards["cards"] = {}
    invalid_states.append(("non-array cards", non_array_cards))

    before = raw_board(database_path)
    for name, invalid_state in invalid_states:
        response = client.put("/api/board", json=invalid_state)
        assert response.status_code == 400, name
        assert raw_board(database_path) == before, name


def test_board_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/board").status_code == 401
    assert client.put("/api/board", json=SEED_BOARD_STATE).status_code == 401


def test_second_user_board_is_isolated(database_path: Path) -> None:
    initialize_database(database_path)
    designer = deepcopy(SEED_BOARD_STATE)
    designer["columns"][0]["title"] = "Concepts"
    designer_state = BoardState.model_validate(designer)

    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        cursor = connection.execute(
            "INSERT INTO users (username) VALUES (?)",
            ("designer",),
        )
        connection.execute(
            "INSERT INTO boards (user_id, state_json) VALUES (?, ?)",
            (cursor.lastrowid, designer_state.model_dump_json(by_alias=True)),
        )

    user_change = deepcopy(SEED_BOARD_STATE)
    user_change["columns"][0]["title"] = "User discovery"
    replace_board(database_path, "user", BoardState.model_validate(user_change))

    assert load_board(database_path, "user").columns[0].title == "User discovery"
    assert load_board(database_path, "designer").columns[0].title == "Concepts"
    with pytest.raises(BoardStoreError):
        load_board(database_path, "unknown")


def test_invalid_stored_board_returns_a_concise_error(
    client: TestClient,
    database_path: Path,
) -> None:
    login(client)
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            "UPDATE boards SET state_json = ?",
            (json.dumps({"columns": [], "cards": []}),),
        )

    response = client.get("/api/board")

    assert response.status_code == 500
    assert response.json() == {"detail": "Board is unavailable"}
    assert "sqlite" not in response.text.lower()
