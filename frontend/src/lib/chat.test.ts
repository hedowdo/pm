import { initialBoardState } from "./board";
import {
  CHAT_HISTORY_KEY,
  ChatApiError,
  clearChatHistory,
  readChatHistory,
  sendChat,
  writeChatHistory,
  type ChatMessage,
} from "./chat";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("chat client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends the current message and complete session history to the same-origin API", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
    ];
    const response = {
      message: "Done",
      appliedOperations: [{ type: "move_card" as const, cardId: "card-brief" }],
      board: initialBoardState,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(sendChat("Move the brief", history)).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Move the brief", history }),
    });
  });

  it("maps authentication and safe API failures", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "Not authenticated" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ detail: "AI service is temporarily busy" }, 503),
      );

    await expect(sendChat("Hello", [])).rejects.toEqual(
      new ChatApiError("Your session expired. Sign in again.", 401),
    );
    await expect(sendChat("Hello", [])).rejects.toEqual(
      new ChatApiError("AI service is temporarily busy", 503),
    );
  });

  it("stores only valid user and assistant messages for the browser session", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Create a task" },
      { role: "assistant", content: "The task was created." },
    ];

    writeChatHistory(history);
    expect(readChatHistory()).toEqual(history);

    window.sessionStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify([{ role: "system" }]));
    expect(readChatHistory()).toEqual([]);

    clearChatHistory();
    expect(window.sessionStorage.getItem(CHAT_HISTORY_KEY)).toBeNull();
  });
});
