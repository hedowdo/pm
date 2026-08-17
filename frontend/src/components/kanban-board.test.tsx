import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardApiError, getBoard, saveBoard } from "@/lib/board-api";
import { initialBoardState, type BoardState } from "@/lib/board";
import { sendChat } from "@/lib/chat";
import { KanbanBoard } from "./kanban-board";

vi.mock("@/lib/board-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/board-api")>();
  return {
    ...actual,
    getBoard: vi.fn(),
    saveBoard: vi.fn(),
  };
});

vi.mock("@/lib/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chat")>();
  return {
    ...actual,
    sendChat: vi.fn(),
  };
});

const getBoardMock = vi.mocked(getBoard);
const saveBoardMock = vi.mocked(saveBoard);
const sendChatMock = vi.mocked(sendChat);

function boardCopy(): BoardState {
  return structuredClone(initialBoardState);
}

function renderBoard(props: Partial<React.ComponentProps<typeof KanbanBoard>> = {}) {
  return render(
    <KanbanBoard
      username="user"
      onLogout={vi.fn()}
      onUnauthorized={vi.fn()}
      {...props}
    />,
  );
}

describe("KanbanBoard", () => {
  beforeEach(() => {
    getBoardMock.mockReset();
    saveBoardMock.mockReset();
    sendChatMock.mockReset();
    window.sessionStorage.clear();
    getBoardMock.mockResolvedValue(boardCopy());
    saveBoardMock.mockImplementation(async (board) => structuredClone(board));
  });

  it("switches the sidebar and its layout column together when entering fullscreen", async () => {
    let bodyWidth = 1000;
    const bodyRect = vi
      .spyOn(document.body, "getBoundingClientRect")
      .mockImplementation(
        () =>
          ({
            bottom: 900,
            height: 900,
            left: 0,
            right: bodyWidth,
            top: 0,
            width: bodyWidth,
            x: 0,
            y: 0,
            toJSON: () => undefined,
          }) as DOMRect,
      );

    renderBoard();

    const layout = await screen.findByTestId("board-layout");
    expect(layout.className).not.toContain("grid-cols-");
    expect(screen.getByRole("button", { name: "Open AI chat" })).toBeInTheDocument();

    act(() => {
      bodyWidth = 1600;
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() =>
      expect(layout.className).toContain("grid-cols-[minmax(0,1fr)_360px]"),
    );
    expect(screen.getByRole("complementary", { name: "AI assistant" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open AI chat" }),
    ).not.toBeInTheDocument();

    bodyRect.mockRestore();
  });

  it("loads the authoritative board and reconciles a rename with the save response", async () => {
    const authoritative = boardCopy();
    authoritative.columns[0].title = "Canonical discovery";
    saveBoardMock.mockResolvedValueOnce(authoritative);
    const user = userEvent.setup();

    renderBoard();

    expect(screen.getByRole("status")).toHaveTextContent("Loading your board");
    await user.click(await screen.findByRole("button", { name: "Rename Ideas" }));
    const input = screen.getByRole("textbox", { name: "Column name" });
    await user.clear(input);
    await user.type(input, "Brainstorm");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(saveBoardMock).toHaveBeenCalledTimes(1));
    expect(saveBoardMock.mock.calls[0][0].columns[0].title).toBe("Brainstorm");
    expect(
      await screen.findByRole("heading", { name: "Canonical discovery" }),
    ).toBeInTheDocument();
  });

  it("creates, edits, and deletes cards through complete-state saves", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByRole("button", { name: "Add card to Ideas" }));
    await user.type(screen.getByLabelText("Card title"), "Prepare team update");
    await user.type(screen.getByLabelText(/Details/), "Include the latest decisions.");
    await user.click(screen.getByRole("button", { name: "Create card" }));
    await waitFor(() => expect(saveBoardMock).toHaveBeenCalledTimes(1));

    await user.click(await screen.findByText("Prepare team update"));
    const titleInput = screen.getByLabelText("Card title");
    await user.clear(titleInput);
    await user.type(titleInput, "Send team update");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveBoardMock).toHaveBeenCalledTimes(2));

    await user.click(await screen.findByText("Send team update"));
    await user.click(screen.getByRole("button", { name: "Delete card" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(saveBoardMock).toHaveBeenCalledTimes(3));

    expect(saveBoardMock.mock.calls[0][0].cards).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Prepare team update" })]),
    );
    expect(saveBoardMock.mock.calls[1][0].cards).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Send team update" })]),
    );
    expect(saveBoardMock.mock.calls[2][0].cards).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Send team update" })]),
    );
  });

  it("allows only one save at a time", async () => {
    let resolveSave: (board: BoardState) => void = () => undefined;
    saveBoardMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByRole("button", { name: "Rename Ideas" }));
    await user.clear(screen.getByRole("textbox", { name: "Column name" }));
    await user.type(screen.getByRole("textbox", { name: "Column name" }), "Brainstorm");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Saving...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add card to Brainstorm" })).toBeDisabled();
    expect(saveBoardMock).toHaveBeenCalledTimes(1);

    const serverBoard = boardCopy();
    serverBoard.columns[0].title = "Server board";
    resolveSave(serverBoard);
    expect(await screen.findByRole("heading", { name: "Server board" })).toBeInTheDocument();
  });

  it("refetches the authoritative board after a failed save", async () => {
    const restored = boardCopy();
    restored.columns[0].title = "Restored from server";
    getBoardMock.mockResolvedValueOnce(boardCopy()).mockResolvedValueOnce(restored);
    saveBoardMock.mockRejectedValueOnce(new BoardApiError("Unable to save your board.", 500));
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByRole("button", { name: "Rename Ideas" }));
    await user.clear(screen.getByRole("textbox", { name: "Column name" }));
    await user.type(screen.getByRole("textbox", { name: "Column name" }), "Unsaved");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("latest board was restored");
    expect(
      screen.getByRole("heading", { name: "Restored from server" }),
    ).toBeInTheDocument();
    expect(getBoardMock).toHaveBeenCalledTimes(2);
  });

  it("shows the authoritative board returned after multiple AI operations", async () => {
    const authoritative = boardCopy();
    authoritative.cards[0].title = "AI revised brief";
    authoritative.cards[1].columnId = "done";
    sendChatMock.mockResolvedValueOnce({
      message: "I updated the brief and moved the kickoff.",
      appliedOperations: [
        { type: "edit_card", cardId: "card-brief" },
        { type: "move_card", cardId: "card-kickoff" },
      ],
      board: authoritative,
    });
    const user = userEvent.setup();

    renderBoard();
    await user.click(await screen.findByRole("button", { name: "Open AI chat" }));
    await user.type(
      screen.getByLabelText("Message the board assistant"),
      "Update the brief and kickoff",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("AI revised brief")).toBeInTheDocument();
    const doneColumn = screen.getByTestId("column-done");
    expect(within(doneColumn).getByText("Schedule project kickoff")).toBeInTheDocument();
    expect(sendChatMock).toHaveBeenCalledWith("Update the brief and kickoff", []);
    expect(saveBoardMock).not.toHaveBeenCalled();
  });

  it("shows a recoverable load error and retries", async () => {
    getBoardMock
      .mockRejectedValueOnce(new BoardApiError("Unable to load your board.", 500))
      .mockResolvedValueOnce(boardCopy());
    const user = userEvent.setup();
    renderBoard();

    expect(await screen.findByRole("heading", { name: "Board unavailable" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("region", { name: "Kanban board" })).toBeInTheDocument();
    expect(getBoardMock).toHaveBeenCalledTimes(2);
  });

  it("reports an expired board session without rendering the board", async () => {
    getBoardMock.mockRejectedValueOnce(
      new BoardApiError("Your session expired. Sign in again.", 401),
    );
    const onUnauthorized = vi.fn();

    renderBoard({ onUnauthorized });

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
    expect(screen.queryByRole("region", { name: "Kanban board" })).not.toBeInTheDocument();
  });
});
