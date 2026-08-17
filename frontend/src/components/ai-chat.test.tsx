import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { initialBoardState, type BoardState } from "@/lib/board";
import { CHAT_HISTORY_KEY, type ChatMessage } from "@/lib/chat";
import { AiChat } from "./ai-chat";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function boardCopy(): BoardState {
  return structuredClone(initialBoardState);
}

function renderChat(
  props: Partial<React.ComponentProps<typeof AiChat>> = {},
) {
  const onBoardReplace = vi.fn();
  const onSendingChange = vi.fn();
  const view = render(
    <AiChat
      onBoardReplace={onBoardReplace}
      onSendingChange={onSendingChange}
      {...props}
    />,
  );
  return { ...view, onBoardReplace, onSendingChange };
}

describe("AiChat", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("opens as an accessible drawer, restores session messages, and returns focus on close", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "What is next?" },
      { role: "assistant", content: "Review the launch copy." },
    ];
    window.sessionStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
    const user = userEvent.setup();

    renderChat();
    const openButton = screen.getByRole("button", { name: "Open AI chat" });
    await user.click(openButton);

    expect(screen.getByRole("dialog", { name: "Plan with AI" })).toBeInTheDocument();
    expect(screen.getByText("What is next?")).toBeInTheDocument();
    expect(screen.getByText("Review the launch copy.")).toBeInTheDocument();
    expect(screen.getByLabelText("Message the board assistant")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Close AI chat" }));
    expect(screen.queryByRole("dialog", { name: "Plan with AI" })).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
  });

  it("prevents duplicate sends, renders the conversation, and replaces the board", async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const authoritative = boardCopy();
    authoritative.cards[0].title = "AI revised brief";
    authoritative.cards[1].columnId = "done";
    const user = userEvent.setup();
    const { onBoardReplace, onSendingChange } = renderChat();

    await user.click(screen.getByRole("button", { name: "Open AI chat" }));
    const input = screen.getByLabelText("Message the board assistant");
    await user.type(input, "Update two cards");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Working on your board...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sending message" })).toBeDisabled();
    expect(onSendingChange).toHaveBeenLastCalledWith(true);

    resolveRequest(
      jsonResponse({
        message: "I updated both cards.",
        appliedOperations: [
          { type: "edit_card", cardId: "card-brief" },
          { type: "move_card", cardId: "card-kickoff" },
        ],
        board: authoritative,
      }),
    );

    expect(await screen.findByText("Update two cards")).toBeInTheDocument();
    expect(screen.getByText("I updated both cards.")).toBeInTheDocument();
    expect(onBoardReplace).toHaveBeenCalledWith(authoritative);
    expect(onSendingChange).toHaveBeenLastCalledWith(false);
    expect(JSON.parse(window.sessionStorage.getItem(CHAT_HISTORY_KEY) ?? "[]")).toEqual([
      { role: "user", content: "Update two cards" },
      { role: "assistant", content: "I updated both cards." },
    ]);
  });

  it("keeps the draft and board unchanged after an error, then retries", async () => {
    const authoritative = boardCopy();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ detail: "AI service is temporarily busy" }, 503),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: "No board changes were needed.",
          appliedOperations: [],
          board: authoritative,
        }),
      );
    const user = userEvent.setup();
    const { onBoardReplace } = renderChat();

    await user.click(screen.getByRole("button", { name: "Open AI chat" }));
    const input = screen.getByLabelText("Message the board assistant");
    await user.type(input, "Summarize this board");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI service is temporarily busy",
    );
    expect(input).toHaveValue("Summarize this board");
    expect(onBoardReplace).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(CHAT_HISTORY_KEY)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(onBoardReplace).toHaveBeenCalledWith(authoritative));
    expect(screen.getByText("No board changes were needed.")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });
});
