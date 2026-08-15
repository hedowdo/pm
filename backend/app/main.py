from pathlib import Path
from secrets import compare_digest, token_urlsafe

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


STATIC_DIR = Path(__file__).parent / "static"
API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
SESSION_COOKIE = "kanban_session"
MVP_USERNAME = "user"
MVP_PASSWORD = "password"


class LoginCredentials(BaseModel):
    username: str
    password: str


def create_app(static_dir: Path = STATIC_DIR) -> FastAPI:
    sessions: dict[str, str] = {}
    application = FastAPI(
        title="Project Management MVP",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
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
        session_id = request.cookies.get(SESSION_COOKIE)
        username = sessions.get(session_id) if session_id else None
        if username is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return {"username": username}

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
