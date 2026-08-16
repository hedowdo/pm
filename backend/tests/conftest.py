from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    directory = tmp_path / "static"
    directory.mkdir()
    (directory / "index.html").write_text(
        '<!doctype html><html><body><h1>Kanban Studio</h1><script src="/_next/static/app.js"></script></body></html>',
        encoding="utf-8",
    )
    (directory / "404.html").write_text(
        "<!doctype html><html><body>Page not found</body></html>",
        encoding="utf-8",
    )
    asset_dir = directory / "_next" / "static"
    asset_dir.mkdir(parents=True)
    (asset_dir / "app.js").write_text(
        "globalThis.kanbanLoaded = true;",
        encoding="utf-8",
    )
    return directory


@pytest.fixture
def database_path(tmp_path: Path) -> Path:
    return tmp_path / "data" / "kanban.db"


@pytest.fixture
def client(static_dir: Path, database_path: Path) -> Iterator[TestClient]:
    with TestClient(create_app(static_dir, database_path)) as test_client:
        yield test_client
