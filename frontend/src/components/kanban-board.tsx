"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  GripVertical,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { AiChat, useDesktopChat } from "@/components/ai-chat";
import { BoardApiError, getBoard, saveBoard } from "@/lib/board-api";
import {
  boardReducer,
  cardsForColumn,
  type BoardAction,
  type BoardColumn,
  type BoardState,
  type ColumnId,
  type KanbanCard,
} from "@/lib/board";

type Editor =
  | { kind: "create"; columnId: ColumnId }
  | { kind: "edit"; cardId: string };

const columnAccents = [
  "bg-[#ecad0a]",
  "bg-[#209dd7]",
  "bg-[#753991]",
  "bg-[#f2684a]",
  "bg-[#2f9b75]",
];

export function KanbanBoard({
  username,
  isLoggingOut = false,
  logoutError,
  onLogout,
  onUnauthorized,
}: {
  username?: string;
  isLoggingOut?: boolean;
  logoutError?: string | null;
  onLogout?: () => void;
  onUnauthorized?: () => void;
}) {
  const [loadState, setLoadState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; board: BoardState }
  >({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getBoard()
      .then((board) => {
        if (active) setLoadState({ status: "ready", board });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (isUnauthorized(error)) {
          onUnauthorized?.();
          return;
        }
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load your board.",
        });
      });
    return () => {
      active = false;
    };
  }, [loadAttempt, onUnauthorized]);

  if (loadState.status === "loading") return <BoardLoading />;
  if (loadState.status === "error") {
    return (
      <BoardLoadError
        message={loadState.message}
        isLoggingOut={isLoggingOut}
        onRetry={() => {
          setLoadState({ status: "loading" });
          setLoadAttempt((attempt) => attempt + 1);
        }}
        onLogout={onLogout}
      />
    );
  }

  return (
    <BoardWorkspace
      initialBoard={loadState.board}
      username={username}
      isLoggingOut={isLoggingOut}
      logoutError={logoutError}
      onLogout={onLogout}
      onUnauthorized={onUnauthorized}
    />
  );
}

function BoardWorkspace({
  initialBoard,
  username,
  isLoggingOut = false,
  logoutError,
  onLogout,
  onUnauthorized,
}: {
  initialBoard: BoardState;
  username?: string;
  isLoggingOut?: boolean;
  logoutError?: string | null;
  onLogout?: () => void;
  onUnauthorized?: () => void;
}) {
  const [board, dispatch] = useReducer(boardReducer, initialBoard);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isChatSending, setIsChatSending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const isDesktopChat = useDesktopChat();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const editingCard =
    editor?.kind === "edit"
      ? board.cards.find((card) => card.id === editor.cardId)
      : undefined;
  const activeCard = board.cards.find((card) => card.id === activeCardId);

  function handleDragStart({ active }: DragStartEvent) {
    if (isSaving || isChatSending || recoveryRequired) return;
    setActiveCardId(String(active.id));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && !isSaving && !isChatSending && !recoveryRequired) {
      void applyAction({
        type: "moveCard",
        activeId: String(active.id),
        overId: String(over.id),
      });
    }
    setActiveCardId(null);
  }

  function saveCard(title: string, details: string) {
    if (!editor) return;

    if (editor.kind === "create") {
      void applyAction({
        type: "addCard",
        card: {
          id: crypto.randomUUID(),
          title,
          details,
          columnId: editor.columnId,
        },
      });
    } else {
      void applyAction({ type: "updateCard", cardId: editor.cardId, title, details });
    }

    setEditor(null);
  }

  function deleteEditingCard() {
    if (editor?.kind !== "edit") return;
    void applyAction({ type: "deleteCard", cardId: editor.cardId });
    setEditor(null);
  }

  async function applyAction(action: BoardAction) {
    if (isSaving || isChatSending || recoveryRequired) return;
    const previousBoard = board;
    const nextBoard = boardReducer(board, action);
    dispatch({ type: "replace", state: nextBoard });
    setSaveError(null);
    setIsSaving(true);

    try {
      const authoritative = await saveBoard(nextBoard);
      dispatch({ type: "replace", state: authoritative });
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized?.();
        return;
      }

      try {
        const authoritative = await getBoard();
        dispatch({ type: "replace", state: authoritative });
        setSaveError("That change was not saved. The latest board was restored.");
      } catch (reloadError) {
        if (isUnauthorized(reloadError)) {
          onUnauthorized?.();
          return;
        }
        dispatch({ type: "replace", state: previousBoard });
        setRecoveryRequired(true);
        setSaveError("Unable to confirm the save. Retry before making more changes.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function retryRecovery() {
    setIsSaving(true);
    try {
      const authoritative = await getBoard();
      dispatch({ type: "replace", state: authoritative });
      setRecoveryRequired(false);
      setSaveError(null);
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized?.();
        return;
      }
      setSaveError("Unable to reload the board. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const interactionsDisabled = isSaving || isChatSending || recoveryRequired;

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
      <div
        data-testid="board-layout"
        className={`mx-auto max-w-[1880px] ${
          isDesktopChat
            ? "grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6"
            : ""
        }`}
      >
        <div className="min-w-0">
        <header className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-4 flex items-center gap-3 text-[11px] font-bold tracking-[0.22em] text-[#753991]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ecad0a] shadow-[0_0_0_5px_rgba(236,173,10,0.16)]" />
              PROJECT BOARD
            </div>
            <h1 className="editorial-title max-w-3xl text-4xl leading-[0.96] font-bold tracking-[-0.055em] text-[#032147] sm:text-5xl lg:text-6xl">
              Kanban Studio
            </h1>
          </div>
          {username && onLogout && (
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <p className="text-xs font-semibold text-[#888888]">
                Signed in as <span className="text-[#032147]">{username}</span>
              </p>
              <button
                type="button"
                disabled={isLoggingOut || isSaving || isChatSending}
                onClick={onLogout}
                className="flex items-center gap-2 rounded-xl border border-[#032147]/15 bg-white/70 px-4 py-2.5 text-sm font-bold text-[#032147] transition hover:border-[#753991] hover:text-[#753991] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#753991] disabled:cursor-wait disabled:opacity-60"
              >
                <LogOut size={16} strokeWidth={2.4} />
                {isLoggingOut ? "Signing out..." : "Sign out"}
              </button>
              {logoutError && (
                <p role="alert" className="text-sm font-semibold text-[#a53b2a]">
                  {logoutError}
                </p>
              )}
              {isSaving && (
                <p role="status" className="text-sm font-semibold text-[#209dd7]">
                  Saving...
                </p>
              )}
              {saveError && (
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <p role="alert" className="text-sm font-semibold text-[#a53b2a]">
                    {saveError}
                  </p>
                  {recoveryRequired && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void retryRecovery()}
                      className="rounded-lg px-3 py-1.5 text-sm font-bold text-[#753991] hover:bg-[#753991]/8 focus-visible:outline-2 focus-visible:outline-[#753991] disabled:opacity-60"
                    >
                      Retry board load
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </header>

        <DndContext
          id="kanban-board"
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragCancel={() => setActiveCardId(null)}
          onDragEnd={handleDragEnd}
        >
          <section
            aria-label="Kanban board"
            className="board-scroll -mx-5 overflow-x-auto px-5 pb-5 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12"
          >
            <div className="grid min-w-[1420px] grid-cols-5 gap-5">
              {board.columns.map((column, index) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={cardsForColumn(board.cards, column.id)}
                  accentClass={columnAccents[index]}
                  disabled={interactionsDisabled}
                  onRename={(title) =>
                    void applyAction({ type: "renameColumn", columnId: column.id, title })
                  }
                  onCreate={() => setEditor({ kind: "create", columnId: column.id })}
                  onEdit={(cardId) => setEditor({ kind: "edit", cardId })}
                />
              ))}
            </div>
          </section>
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
            {activeCard ? <DraggedCardPreview card={activeCard} /> : null}
          </DragOverlay>
        </DndContext>
        </div>

        <AiChat
          disabled={isSaving || recoveryRequired}
          isDesktop={isDesktopChat}
          onBoardReplace={(authoritative) =>
            dispatch({ type: "replace", state: authoritative })
          }
          onSendingChange={setIsChatSending}
          onUnauthorized={onUnauthorized}
        />
      </div>

      <CardEditorDialog
        editor={editor}
        card={editingCard}
        column={
          editor?.kind === "create"
            ? board.columns.find((column) => column.id === editor.columnId)
            : editingCard
              ? board.columns.find((column) => column.id === editingCard.columnId)
              : undefined
        }
        onClose={() => setEditor(null)}
        onSave={saveCard}
        onDelete={deleteEditingCard}
      />
    </main>
  );
}

function BoardLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-[1.75rem] border border-[#032147]/10 bg-white/75 p-8 text-center shadow-[0_18px_45px_rgba(3,33,71,0.08)] backdrop-blur-sm">
        <span className="mx-auto mb-5 block h-3 w-3 animate-pulse rounded-full bg-[#209dd7] shadow-[0_0_0_7px_rgba(32,157,215,0.14)]" />
        <p role="status" className="font-bold text-[#032147]">
          Loading your board...
        </p>
      </div>
    </main>
  );
}

function BoardLoadError({
  message,
  isLoggingOut,
  onRetry,
  onLogout,
}: {
  message: string;
  isLoggingOut: boolean;
  onRetry: () => void;
  onLogout?: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-md rounded-[1.75rem] border border-[#032147]/10 bg-white/80 p-8 text-center shadow-[0_18px_45px_rgba(3,33,71,0.08)]">
        <h1 className="editorial-title text-3xl font-bold text-[#032147]">Board unavailable</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-[#888888]">
          {message}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-[#753991] px-5 py-3 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#753991]"
          >
            Retry
          </button>
          {onLogout && (
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={onLogout}
              className="rounded-xl border border-[#032147]/15 px-5 py-3 text-sm font-bold text-[#032147] disabled:opacity-60"
            >
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof BoardApiError && error.status === 401;
}

function KanbanColumn({
  column,
  cards,
  accentClass,
  disabled,
  onRename,
  onCreate,
  onEdit,
}: {
  column: BoardColumn;
  cards: KanbanCard[];
  accentClass: string;
  disabled: boolean;
  onRename: (title: string) => void;
  onCreate: () => void;
  onEdit: (cardId: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(column.title);
  const { isOver, setNodeRef } = useDroppable({ id: column.id });

  function commitRename() {
    const nextTitle = title.trim();
    if (nextTitle) onRename(nextTitle);
    else setTitle(column.title);
    setIsRenaming(false);
  }

  function toggleRename() {
    if (isRenaming) {
      commitRename();
    } else {
      setTitle(column.title);
      setIsRenaming(true);
    }
  }

  return (
    <section
      data-testid={`column-${column.id}`}
      className="rounded-[1.7rem] border border-[#032147]/10 bg-white/65 p-3 shadow-[0_18px_45px_rgba(3,33,71,0.07)] backdrop-blur-sm"
    >
      <div className="mb-3 rounded-[1.15rem] bg-[#032147] px-4 py-4 text-white">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accentClass}`} />
            {isRenaming ? (
              <input
                aria-label="Column name"
                autoFocus
                disabled={disabled}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") {
                    setTitle(column.title);
                    setIsRenaming(false);
                  }
                }}
                className="w-full border-b border-white/50 bg-transparent pb-1 text-lg font-bold outline-none"
              />
            ) : (
              <h2 className="truncate text-lg font-bold tracking-[-0.025em]">
                {column.title}
              </h2>
            )}
          </div>
          <button
            type="button"
            disabled={disabled}
            aria-label={isRenaming ? `Save ${column.title}` : `Rename ${column.title}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleRename();
            }}
            onClick={(event) => {
              if (event.detail === 0) {
                toggleRename();
              }
            }}
            className="rounded-lg p-1 text-white/65 transition hover:bg-white/12 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-45"
          >
            {isRenaming ? <Check size={16} strokeWidth={2.8} /> : <Pencil size={15} strokeWidth={2.4} />}
          </button>
        </div>
        <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-white/55">
          <span>{cards.length} {cards.length === 1 ? "card" : "cards"}</span>
          <span className="h-px w-10 bg-white/25" />
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-44 space-y-3 rounded-[1.15rem] p-1.5 transition-colors ${
          isOver ? "bg-[#ecad0a]/14" : "bg-transparent"
        }`}
      >
        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              disabled={disabled}
              onClick={() => onEdit(card.id)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-[#032147]/18 px-5 text-center text-xs font-semibold leading-5 text-[#888888]">
            Drop a card here
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        aria-label={`Add card to ${column.title}`}
        onClick={onCreate}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#032147]/20 px-3 py-3 text-sm font-bold text-[#032147] transition hover:border-[#753991] hover:bg-[#753991] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#753991] disabled:cursor-wait disabled:opacity-45"
      >
        <Plus size={16} strokeWidth={2.5} />
        Add card
      </button>
    </section>
  );
}

function KanbanCard({
  card,
  disabled,
  onClick,
}: {
  card: KanbanCard;
  disabled: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id });

  return (
    <article
      ref={setNodeRef}
      data-testid="kanban-card"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`group relative select-none rounded-2xl border border-[#032147]/9 bg-white px-4 pt-4 pb-3.5 shadow-[0_7px_16px_rgba(3,33,71,0.055)] transition-[box-shadow,opacity] hover:shadow-[0_13px_24px_rgba(3,33,71,0.11)] ${
        isDragging ? "z-20 scale-[0.98] opacity-25 shadow-none" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-label={`Edit ${card.title}`}
          onClick={onClick}
          className="flex min-w-0 flex-1 items-start gap-2 text-left focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#209dd7] disabled:cursor-wait"
        >
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#ecad0a]" />
          <span className="min-w-0 flex-1">
            <h3 className="text-[15px] leading-5 font-bold tracking-[-0.018em] text-[#032147]">
              {card.title}
            </h3>
            <p className="mt-3 line-clamp-3 text-[13px] leading-5 text-[#888888]">
              {card.details}
            </p>
          </span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Drag ${card.title}`}
          onClick={(event) => event.stopPropagation()}
          className="-mr-1 -mt-1 cursor-grab touch-none rounded-md p-1 text-[#888888] opacity-0 transition hover:bg-[#032147]/6 hover:text-[#032147] active:cursor-grabbing group-hover:opacity-100 focus:opacity-100 focus-visible:outline-2 focus-visible:outline-[#209dd7]"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} strokeWidth={2.3} />
        </button>
      </div>
    </article>
  );
}

function DraggedCardPreview({ card }: { card: KanbanCard }) {
  return (
    <article className="w-[265px] rotate-[1.5deg] cursor-grabbing rounded-2xl border border-[#ecad0a]/60 bg-white px-4 pt-4 pb-3.5 shadow-[0_20px_38px_rgba(3,33,71,0.24)]">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#ecad0a]" />
        <h3 className="text-[15px] leading-5 font-bold tracking-[-0.018em] text-[#032147]">
          {card.title}
        </h3>
      </div>
      <p className="line-clamp-3 text-[13px] leading-5 text-[#888888]">{card.details}</p>
    </article>
  );
}

function CardEditorDialog({
  editor,
  card,
  column,
  onClose,
  onSave,
  onDelete,
}: {
  editor: Editor | null;
  card?: KanbanCard;
  column?: BoardColumn;
  onClose: () => void;
  onSave: (title: string, details: string) => void;
  onDelete: () => void;
}) {
  if (!editor) return null;

  const isEditing = editor.kind === "edit";

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#032147]/45 backdrop-blur-[3px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-white/60 bg-[#fcfbf7] p-6 shadow-[0_24px_80px_rgba(3,33,71,0.3)] sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-5">
            <div>
              <p className="mb-2 text-[10px] font-bold tracking-[0.2em] text-[#753991] uppercase">
                {column?.title ?? "Board"}
              </p>
              <Dialog.Title className="editorial-title text-3xl font-bold tracking-[-0.045em] text-[#032147]">
                {isEditing ? "Shape this card" : "Add a fresh card"}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-5 text-[#888888]">
                Keep it clear enough for the next person to pick up.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close card editor"
                className="rounded-xl p-2 text-[#888888] transition hover:bg-[#032147]/6 hover:text-[#032147] focus-visible:outline-2 focus-visible:outline-[#209dd7]"
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <CardEditorForm
            key={isEditing ? card?.id : editor.columnId}
            card={card}
            isEditing={isEditing}
            onSave={onSave}
            onDelete={onDelete}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CardEditorForm({
  card,
  isEditing,
  onSave,
  onDelete,
}: {
  card?: KanbanCard;
  isEditing: boolean;
  onSave: (title: string, details: string) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(card?.title ?? "");
  const [details, setDetails] = useState(card?.details ?? "");
  const [showTitleError, setShowTitleError] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setShowTitleError(true);
      return;
    }
    onSave(nextTitle, details.trim());
  }

  return (
    <form onSubmit={submit}>
            <label className="block text-sm font-bold text-[#032147]" htmlFor="card-title">
              Card title
            </label>
            <input
              id="card-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setShowTitleError(false);
              }}
              placeholder="What needs to happen?"
              className="mt-2 w-full rounded-xl border border-[#032147]/16 bg-white px-4 py-3 text-[15px] outline-none transition placeholder:text-[#888888]/70 focus:border-[#209dd7] focus:ring-3 focus:ring-[#209dd7]/15"
            />
            {showTitleError && (
              <p role="alert" className="mt-2 text-sm font-medium text-[#a53b2a]">
                Give this card a title before saving it.
              </p>
            )}

            <label className="mt-5 block text-sm font-bold text-[#032147]" htmlFor="card-details">
              Details <span className="font-normal text-[#888888]">(optional)</span>
            </label>
            <textarea
              id="card-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Add just enough context to keep things moving."
              rows={5}
              className="mt-2 w-full resize-none rounded-xl border border-[#032147]/16 bg-white px-4 py-3 text-[15px] leading-6 outline-none transition placeholder:text-[#888888]/70 focus:border-[#209dd7] focus:ring-3 focus:ring-[#209dd7]/15"
            />

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              {isEditing ? (
                isConfirmingDelete ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-[#a53b2a]">Delete this card?</span>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(false)}
                      className="rounded-lg px-2 py-1 font-bold text-[#888888] hover:text-[#032147]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      className="rounded-lg bg-[#a53b2a] px-3 py-1.5 font-bold text-white transition hover:bg-[#8f3021] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a53b2a]"
                    >
                      Confirm delete
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(true)}
                    className="flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-[#a53b2a] transition hover:bg-[#a53b2a]/8 focus-visible:outline-2 focus-visible:outline-[#a53b2a]"
                  >
                    <Trash2 size={16} />
                    Delete card
                  </button>
                )
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="flex items-center justify-center gap-2 rounded-xl bg-[#753991] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_17px_rgba(117,57,145,0.22)] transition hover:-translate-y-0.5 hover:bg-[#63307c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#753991]"
              >
                <Check size={16} strokeWidth={2.8} />
                {isEditing ? "Save changes" : "Create card"}
              </button>
            </div>
    </form>
  );
}
