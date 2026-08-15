#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

cd "$REPO_ROOT"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set OPENROUTER_API_KEY." >&2
  exit 1
fi

docker compose up --build --detach --wait
echo "Application ready at http://localhost:8000"
