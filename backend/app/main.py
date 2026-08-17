import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from secrets import compare_digest, token_urlsafe
from typing import Annotated, Callable

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.ai import (
    AIResponseError,
    AssistantBoardResponse,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    apply_board_operations,
    generate_card_id,
)
from app.database import BoardStoreError, initialize_database, load_board, replace_board
from app.models import BoardState
from app.openrouter import OpenRouterError, request_board_completion


STATIC_DIR = Path(__file__).parent / "static"
DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", "/data/kanban.db"))
API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
SESSION_COOKIE = "kanban_session"
MVP_USERNAME = "user"
MVP_PASSWORD = "password"


class LoginCredentials(BaseModel):
    username: str
    password: str


def create_app(
    static_dir: Path = STATIC_DIR,
    database_path: Path = DATABASE_PATH,
    chat_completion: Callable[
        [BoardState, str, list[ChatMessage]], AssistantBoardResponse
    ] = request_board_completion,
    card_id_factory: Callable[[], str] = generate_card_id,
) -> FastAPI:
    sessions: dict[str, str] = {}

    @asynccontextmanager
    async def lifespan(_application: FastAPI) -> AsyncIterator[None]:
        initialize_database(database_path)
        yield

    application = FastAPI(
        title="Project Management MVP",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )

    @application.exception_handler(RequestValidationError)
    async def invalid_request(
        _request: Request,
        _error: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": "Invalid request"})

    @application.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.post("/api/auth/login")
    def login(credentials: LoginCredentials, response: Response) -> dict[str, str]:
        valid_username = compare_digest(credentials.username, MVP_USERNAME)
        valid_password = compare_digest(credentials.password, MVP_PASSWORD)
        if not valid_username or not valid_password:
            raise HTTPException(status_code=401, detail="Invalid username or password")

        session_id = token_urlsafe(32)
        sessions[session_id] = MVP_USERNAME
        response.set_cookie(
            key=SESSION_COOKIE,
            value=session_id,
            httponly=True,
            samesite="lax",
            secure=False,
            path="/",
        )
        return {"username": MVP_USERNAME}

    @application.get("/api/auth/me")
    def current_user(request: Request) -> dict[str, str]:
        return {"username": require_user(request)}

    @application.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
    def logout(request: Request, response: Response) -> None:
        session_id = request.cookies.get(SESSION_COOKIE)
        if session_id:
            sessions.pop(session_id, None)
        response.delete_cookie(
            key=SESSION_COOKIE,
            httponly=True,
            samesite="lax",
            secure=False,
            path="/",
        )

    def require_user(request: Request) -> str:
        session_id = request.cookies.get(SESSION_COOKIE)
        username = sessions.get(session_id) if session_id else None
        if username is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return username

    CurrentUsername = Annotated[str, Depends(require_user)]

    @application.get("/api/board", response_model=BoardState)
    def get_board(username: CurrentUsername) -> BoardState:
        try:
            return load_board(database_path, username)
        except BoardStoreError:
            raise HTTPException(status_code=500, detail="Board is unavailable") from None

    @application.put("/api/board", response_model=BoardState)
    def put_board(board: BoardState, username: CurrentUsername) -> BoardState:
        try:
            return replace_board(database_path, username, board)
        except BoardStoreError:
            raise HTTPException(status_code=500, detail="Board could not be saved") from None

    @application.post("/api/chat", response_model=ChatResponse)
    def chat(request: ChatRequest, username: CurrentUsername) -> ChatResponse:
        try:
            board = load_board(database_path, username)
        except BoardStoreError:
            raise HTTPException(status_code=500, detail="Board is unavailable") from None

        try:
            assistant = chat_completion(board, request.message, request.history)
        except OpenRouterError as error:
            raise HTTPException(
                status_code=error.status_code,
                detail=error.detail,
            ) from None

        try:
            updated, applied = apply_board_operations(
                board,
                assistant.operations,
                card_id_factory,
            )
        except AIResponseError:
            raise HTTPException(
                status_code=502,
                detail="AI response could not be applied",
            ) from None

        if applied:
            try:
                updated = replace_board(database_path, username, updated)
            except BoardStoreError:
                raise HTTPException(
                    status_code=500,
                    detail="Board could not be saved",
                ) from None

        return ChatResponse(
            message=assistant.message,
            appliedOperations=applied,
            board=updated,
        )

    @application.api_route("/api", methods=API_METHODS, include_in_schema=False)
    @application.api_route("/api/{path:path}", methods=API_METHODS, include_in_schema=False)
    def unknown_api(path: str = "") -> None:
        raise HTTPException(status_code=404)

    application.mount(
        "/",
        StaticFiles(directory=static_dir, html=True),
        name="frontend",
    )
    return application


app = create_app()
