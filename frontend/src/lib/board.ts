export type ColumnId = "ideas" | "todo" | "in-progress" | "review" | "done";

export type BoardColumn = {
  id: ColumnId;
  title: string;
};

export type KanbanCard = {
  id: string;
  title: string;
  details: string;
  columnId: ColumnId;
};

export type BoardState = {
  columns: BoardColumn[];
  cards: KanbanCard[];
};

export type BoardAction =
  | { type: "renameColumn"; columnId: ColumnId; title: string }
  | { type: "addCard"; card: KanbanCard }
  | { type: "updateCard"; cardId: string; title: string; details: string }
  | { type: "deleteCard"; cardId: string }
  | { type: "moveCard"; activeId: string; overId: string }
  | { type: "replace"; state: BoardState };

export const initialBoardState: BoardState = {
  columns: [
    { id: "ideas", title: "Ideas" },
    { id: "todo", title: "To Do" },
    { id: "in-progress", title: "In Progress" },
    { id: "review", title: "Review" },
    { id: "done", title: "Done" },
  ],
  cards: [
    {
      id: "card-brief",
      title: "Share project brief",
      details: "Give the team a crisp starting point for the launch sprint.",
      columnId: "ideas",
    },
    {
      id: "card-kickoff",
      title: "Schedule project kickoff",
      details: "Find a time that brings design, product, and engineering together.",
      columnId: "ideas",
    },
    {
      id: "card-audience",
      title: "Map the launch audience",
      details: "Turn our customer notes into a focused audience snapshot.",
      columnId: "todo",
    },
    {
      id: "card-story",
      title: "Outline campaign story",
      details: "Shape the narrative before the visual system takes over.",
      columnId: "todo",
    },
    {
      id: "card-homepage",
      title: "Design homepage concepts",
      details: "Explore two confident directions for the new hero section.",
      columnId: "in-progress",
    },
    {
      id: "card-copy",
      title: "Polish launch copy",
      details: "Make the first message clear, concise, and worth sharing.",
      columnId: "review",
    },
    {
      id: "card-qa",
      title: "Review sign-up flow",
      details: "Check the complete path from the hero button to confirmation.",
      columnId: "review",
    },
    {
      id: "card-demo",
      title: "Demo the new board",
      details: "Walk the team through the first version and gather reactions.",
      columnId: "done",
    },
  ],
};

export function cardsForColumn(cards: KanbanCard[], columnId: ColumnId) {
  return cards.filter((card) => card.columnId === columnId);
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "renameColumn":
      return {
        ...state,
        columns: state.columns.map((column) =>
          column.id === action.columnId ? { ...column, title: action.title } : column,
        ),
      };
    case "addCard":
      return { ...state, cards: [...state.cards, action.card] };
    case "updateCard":
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.id === action.cardId
            ? { ...card, title: action.title, details: action.details }
            : card,
        ),
      };
    case "deleteCard":
      return {
        ...state,
        cards: state.cards.filter((card) => card.id !== action.cardId),
      };
    case "moveCard":
      return moveCard(state, action.activeId, action.overId);
    case "replace":
      return action.state;
  }
}

export function moveCard(
  state: BoardState,
  activeId: string,
  overId: string,
): BoardState {
  const activeCard = state.cards.find((card) => card.id === activeId);
  const overCard = state.cards.find((card) => card.id === overId);
  const overColumn = state.columns.find((column) => column.id === overId);

  if (!activeCard || activeId === overId || (!overCard && !overColumn)) {
    return state;
  }

  const targetColumnId = overCard?.columnId ?? overColumn!.id;
  const cardsWithoutActive = state.cards.filter((card) => card.id !== activeId);
  const movedCard = { ...activeCard, columnId: targetColumnId };

  let insertionIndex = -1;

  if (overCard) {
    insertionIndex = cardsWithoutActive.findIndex((card) => card.id === overCard.id);
  } else {
    cardsWithoutActive.forEach((card, index) => {
      if (card.columnId === targetColumnId) {
        insertionIndex = index + 1;
      }
    });
  }

  cardsWithoutActive.splice(
    insertionIndex === -1 ? cardsWithoutActive.length : insertionIndex,
    0,
    movedCard,
  );

  return { ...state, cards: cardsWithoutActive };
}
