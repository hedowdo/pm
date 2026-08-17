import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardApiError, getBoard, saveBoard } from "@/lib/board-api";
import { initialBoardState, type BoardState } from "@/lib/board";
import { KanbanBoard } from "./kanban-board";

vi.mock("@/lib/board-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/board-api")>();
  return {
    ...actual,
    getBoard: vi.fn(),
    saveBoard: vi.fn(),
  };
});

const getBoardMock = vi.mocked(getBoard);
const saveBoardMock = vi.mocked(saveBoard);

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
    getBoardMock.mockResolvedValue(boardCopy());
    saveBoardMock.mockImplementation(async (board) => structuredClone(board));
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
