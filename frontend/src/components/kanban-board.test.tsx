import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "./kanban-board";
import {
  BOARD_STORAGE_KEY,
  initialBoardState,
  readSavedBoard,
} from "@/lib/board";

describe("KanbanBoard", () => {
  beforeEach(() => window.localStorage.clear());

  it("renders the seeded board and lets a column be renamed", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

    expect(screen.getByRole("heading", { name: "Ideas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Done" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename Ideas" }));
    const input = screen.getByRole("textbox", { name: "Column name" });
    await user.clear(input);
    await user.type(input, "Brainstorm");
    await user.keyboard("{Enter}");

    expect(screen.getByRole("heading", { name: "Brainstorm" })).toBeInTheDocument();
  });

  it("creates and edits a card", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

    await user.click(screen.getByRole("button", { name: "Add card to Ideas" }));
    await user.type(screen.getByLabelText("Card title"), "Prepare team update");
    await user.type(screen.getByLabelText(/Details/), "Include the latest decisions.");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    const newCard = screen.getByText("Prepare team update");
    expect(newCard).toBeInTheDocument();
    await user.click(newCard);
    const titleInput = screen.getByLabelText("Card title");
    await user.clear(titleInput);
    await user.type(titleInput, "Send team update");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Send team update")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        readSavedBoard(window.localStorage.getItem(BOARD_STORAGE_KEY))?.cards.some(
          (card) => card.title === "Send team update",
        ),
      ).toBe(true),
    );
  });

  it("requires confirmation before deleting a card", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

    await user.click(screen.getByText("Share project brief"));
    await user.click(screen.getByRole("button", { name: "Delete card" }));
    expect(screen.getByText("Delete this card?")).toBeInTheDocument();
    expect(screen.getByText("Share project brief")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(screen.queryByText("Share project brief")).not.toBeInTheDocument();
  });

  it("restores a board from browser storage", async () => {
    window.localStorage.setItem(
      BOARD_STORAGE_KEY,
      JSON.stringify({
        ...initialBoardState,
        columns: initialBoardState.columns.map((column) =>
          column.id === "ideas" ? { ...column, title: "Saved ideas" } : column,
        ),
      }),
    );

    render(<KanbanBoard />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Saved ideas" })).toBeInTheDocument(),
    );
  });
});
