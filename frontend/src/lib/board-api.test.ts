import { BoardApiError, getBoard, saveBoard } from "./board-api";
import { initialBoardState } from "./board";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("board API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads the complete board from the same-origin endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(initialBoardState));

    await expect(getBoard()).resolves.toEqual(initialBoardState);
    expect(fetchMock).toHaveBeenCalledWith("/api/board", {
      credentials: "same-origin",
    });
  });

  it("saves the complete board and returns the authoritative response", async () => {
    const authoritative = structuredClone(initialBoardState);
    authoritative.columns[0].title = "Canonical title";
    fetchMock.mockResolvedValueOnce(jsonResponse(authoritative));

    await expect(saveBoard(initialBoardState)).resolves.toEqual(authoritative);
    expect(fetchMock).toHaveBeenCalledWith("/api/board", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initialBoardState),
    });
  });

  it("maps unauthorized and server failures to useful errors", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Not authenticated" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "Unavailable" }, 500));

    await expect(getBoard()).rejects.toEqual(
      new BoardApiError("Your session expired. Sign in again.", 401),
    );
    await expect(saveBoard(initialBoardState)).rejects.toEqual(
      new BoardApiError("Unable to save your board.", 500),
    );
  });
});
