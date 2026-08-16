import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from pydantic import ValidationError

from app.models import BoardState


CREATE_USERS_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE
        CHECK (length(trim(username)) > 0)
)
"""

CREATE_BOARDS_SQL = """
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE
        REFERENCES users(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL
        CHECK (json_valid(state_json))
)
"""

SEED_BOARD_STATE = {
    "columns": [
        {"id": "ideas", "title": "Ideas"},
        {"id": "todo", "title": "To Do"},
        {"id": "in-progress", "title": "In Progress"},
        {"id": "review", "title": "Review"},
        {"id": "done", "title": "Done"},
    ],
    "cards": [
        {
            "id": "card-brief",
            "title": "Share project brief",
            "details": "Give the team a crisp starting point for the launch sprint.",
            "columnId": "ideas",
        },
        {
            "id": "card-kickoff",
            "title": "Schedule project kickoff",
            "details": "Find a time that brings design, product, and engineering together.",
            "columnId": "ideas",
        },
        {
            "id": "card-audience",
            "title": "Map the launch audience",
            "details": "Turn our customer notes into a focused audience snapshot.",
            "columnId": "todo",
        },
        {
            "id": "card-story",
            "title": "Outline campaign story",
            "details": "Shape the narrative before the visual system takes over.",
            "columnId": "todo",
        },
        {
            "id": "card-homepage",
            "title": "Design homepage concepts",
            "details": "Explore two confident directions for the new hero section.",
            "columnId": "in-progress",
        },
        {
            "id": "card-copy",
            "title": "Polish launch copy",
            "details": "Make the first message clear, concise, and worth sharing.",
            "columnId": "review",
        },
        {
            "id": "card-qa",
            "title": "Review sign-up flow",
            "details": "Check the complete path from the hero button to confirmation.",
            "columnId": "review",
        },
        {
            "id": "card-demo",
            "title": "Demo the new board",
            "details": "Walk the team through the first version and gather reactions.",
            "columnId": "done",
        },
    ],
}


class BoardStoreError(RuntimeError):
    pass


def initialize_database(database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    seed = BoardState.model_validate(SEED_BOARD_STATE)

    try:
        with _connection(database_path) as connection, connection:
            connection.execute(CREATE_USERS_SQL)
            connection.execute(CREATE_BOARDS_SQL)
            connection.execute(
                "INSERT OR IGNORE INTO users (username) VALUES (?)",
                ("user",),
            )
            user = connection.execute(
                "SELECT id FROM users WHERE username = ?",
                ("user",),
            ).fetchone()
            if user is None:
                raise BoardStoreError("Seed user is unavailable")
            connection.execute(
                "INSERT OR IGNORE INTO boards (user_id, state_json) VALUES (?, ?)",
                (user["id"], _serialize(seed)),
            )
    except sqlite3.Error as error:
        raise BoardStoreError("Database initialization failed") from error


def load_board(database_path: Path, username: str) -> BoardState:
    try:
        with _connection(database_path) as connection:
            row = connection.execute(
                """
                SELECT b.state_json
                FROM boards AS b
                JOIN users AS u ON u.id = b.user_id
                WHERE u.username = ?
                """,
                (username,),
            ).fetchone()
    except sqlite3.Error as error:
        raise BoardStoreError("Board load failed") from error

    if row is None:
        raise BoardStoreError("Board is unavailable")
    try:
        return BoardState.model_validate_json(row["state_json"])
    except ValidationError as error:
        raise BoardStoreError("Stored board is invalid") from error


def replace_board(database_path: Path, username: str, board: BoardState) -> BoardState:
    canonical = BoardState.model_validate(board.model_dump(by_alias=True))
    serialized = _serialize(canonical)

    try:
        with _connection(database_path) as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                cursor = connection.execute(
                    """
                    UPDATE boards
                    SET state_json = ?
                    WHERE user_id = (SELECT id FROM users WHERE username = ?)
                    """,
                    (serialized, username),
                )
                if cursor.rowcount != 1:
                    raise BoardStoreError("Board is unavailable")
                connection.commit()
            except Exception:
                connection.rollback()
                raise
    except sqlite3.Error as error:
        raise BoardStoreError("Board replacement failed") from error

    return canonical


def _serialize(board: BoardState) -> str:
    return board.model_dump_json(by_alias=True)


@contextmanager
def _connection(database_path: Path) -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
    finally:
        connection.close()
