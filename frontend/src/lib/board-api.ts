import type { BoardState } from "@/lib/board";

export class BoardApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BoardApiError";
  }
}

export async function getBoard(): Promise<BoardState> {
  const response = await fetch("/api/board", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new BoardApiError("Your session expired. Sign in again.", 401);
  }
  if (!response.ok) {
    throw new BoardApiError("Unable to load your board.", response.status);
  }
  return response.json() as Promise<BoardState>;
}

export async function saveBoard(board: BoardState): Promise<BoardState> {
  const response = await fetch("/api/board", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
  });

  if (response.status === 401) {
    throw new BoardApiError("Your session expired. Sign in again.", 401);
  }
  if (!response.ok) {
    throw new BoardApiError("Unable to save your board.", response.status);
  }
  return response.json() as Promise<BoardState>;
}
