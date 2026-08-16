from fastapi.testclient import TestClient

from app.main import SESSION_COOKIE


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_serves_static_frontend(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Kanban Studio" in response.text


def test_next_static_asset_is_served(client: TestClient) -> None:
    response = client.get("/_next/static/app.js")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/javascript")
    assert response.text == "globalThis.kanbanLoaded = true;"


def test_unknown_api_route_is_not_replaced_by_static_html(client: TestClient) -> None:
    response = client.get("/api/not-found")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"detail": "Not Found"}


def test_unknown_frontend_path_uses_static_404(client: TestClient) -> None:
    response = client.get("/missing-page")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("text/html")
    assert "Page not found" in response.text


def test_auth_session_lifecycle(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )

    assert login.status_code == 200
    assert login.json() == {"username": "user"}
    set_cookie = login.headers["set-cookie"].lower()
    assert f"{SESSION_COOKIE}=" in set_cookie
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/" in set_cookie
    assert "; secure" not in set_cookie
    assert client.get("/api/auth/me").json() == {"username": "user"}

    logout = client.post("/api/auth/logout")

    assert logout.status_code == 204
    assert "max-age=0" in logout.headers["set-cookie"].lower()
    assert client.get("/api/auth/me").status_code == 401


def test_auth_rejects_invalid_requests_and_unknown_sessions(client: TestClient) -> None:
    invalid = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "wrong"},
    )
    malformed = client.post("/api/auth/login", json={"username": "user"})
    client.cookies.set(SESSION_COOKIE, "unknown-session")

    assert invalid.status_code == 401
    assert malformed.status_code == 400
    assert malformed.json() == {"detail": "Invalid request"}
    assert client.get("/api/auth/me").status_code == 401
