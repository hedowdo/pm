import {
  boardReducer,
  cardsForColumn,
  initialBoardState,
} from "./board";

describe("boardReducer", () => {
  it("starts with five seeded columns and cards", () => {
    expect(initialBoardState.columns).toHaveLength(5);
    expect(initialBoardState.columns.map((column) => column.title)).toEqual([
      "Ideas",
      "To Do",
      "In Progress",
      "Review",
      "Done",
    ]);
    expect(initialBoardState.cards.length).toBeGreaterThan(0);
  });

  it("renames only the chosen column", () => {
    const next = boardReducer(initialBoardState, {
      type: "renameColumn",
      columnId: "ideas",
      title: "Brainstorm",
    });

    expect(next.columns.find((column) => column.id === "ideas")?.title).toBe(
      "Brainstorm",
    );
    expect(next.columns.find((column) => column.id === "todo")?.title).toBe("To Do");
  });

  it("adds, updates, and deletes a card", () => {
    const added = boardReducer(initialBoardState, {
      type: "addCard",
      card: {
        id: "card-new",
        title: "Prepare launch notes",
        details: "A concise recap for everyone.",
        columnId: "todo",
      },
    });
    const updated = boardReducer(added, {
      type: "updateCard",
      cardId: "card-new",
      title: "Prepare polished launch notes",
      details: "A sharper recap.",
    });
    const deleted = boardReducer(updated, { type: "deleteCard", cardId: "card-new" });

    expect(updated.cards.find((card) => card.id === "card-new")).toMatchObject({
      title: "Prepare polished launch notes",
      details: "A sharper recap.",
    });
    expect(deleted.cards.find((card) => card.id === "card-new")).toBeUndefined();
  });

  it("reorders cards within a column", () => {
    const next = boardReducer(initialBoardState, {
      type: "moveCard",
      activeId: "card-kickoff",
      overId: "card-brief",
    });

    expect(cardsForColumn(next.cards, "ideas").map((card) => card.id)).toEqual([
      "card-kickoff",
      "card-brief",
    ]);
  });

  it("moves cards across columns and into an empty column", () => {
    const movedAcross = boardReducer(initialBoardState, {
      type: "moveCard",
      activeId: "card-brief",
      overId: "card-copy",
    });
    const withoutDoneCards = {
      ...initialBoardState,
      cards: initialBoardState.cards.filter((card) => card.columnId !== "done"),
    };
    const movedToEmpty = boardReducer(withoutDoneCards, {
      type: "moveCard",
      activeId: "card-kickoff",
      overId: "done",
    });

    expect(cardsForColumn(movedAcross.cards, "review")[0]).toMatchObject({
      id: "card-brief",
      columnId: "review",
    });
    expect(cardsForColumn(movedToEmpty.cards, "done").map((card) => card.id)).toEqual([
      "card-kickoff",
    ]);
  });
});
