# Database design proposal

Status: approved in Part 5 and implemented in Part 6.

## Decision

Use two SQLite tables: `users` and `boards`. Each user owns at most one board row, and that row stores one canonical `BoardState` JSON document. The hardcoded password and AI chat history are never stored.

This is the smallest model that matches the application today. The frontend already represents card membership and ordering as one ordered `cards[]` array, so splitting cards and columns into rows would add joins, position management, and multi-row transaction logic without enabling an MVP requirement.

The machine-readable source for the table definition, JSON Schema, seed board, and complete valid and invalid examples is `docs/database-schema.json`.

## SQLite schema

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE
        CHECK (length(trim(username)) > 0)
);

CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE
        REFERENCES users(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL
        CHECK (json_valid(state_json))
);
```

`INTEGER PRIMARY KEY` supplies a stable SQLite row identifier without the unnecessary `AUTOINCREMENT` behavior. `boards.user_id UNIQUE` enforces one board per user while allowing more user rows later. The foreign key prevents orphan boards, and `json_valid` prevents syntactically invalid JSON. Application validation enforces the stronger `BoardState` rules.

Every database connection enables `PRAGMA foreign_keys = ON` because SQLite applies that setting per connection.

## Canonical BoardState

The API and stored JSON use the same shape:

```json
{
  "columns": [
    { "id": "ideas", "title": "Ideas" },
    { "id": "todo", "title": "To Do" },
    { "id": "in-progress", "title": "In Progress" },
    { "id": "review", "title": "Review" },
    { "id": "done", "title": "Done" }
  ],
  "cards": [
    {
      "id": "card-brief",
      "title": "Share project brief",
      "details": "Give the team a crisp starting point for the launch sprint.",
      "columnId": "ideas"
    }
  ]
}
```

The five column IDs must appear exactly once and in this exact order: `ideas`, `todo`, `in-progress`, `review`, `done`. Only column titles are editable.

Card order is the order of the single `cards[]` array after filtering by `columnId`, matching the current reducer. A card move changes its `columnId` when necessary and changes its location in that array. No separate position value exists.

## Validation and canonicalization

Part 6 implements strict Pydantic models with unknown fields forbidden. The complete model is validated after every database read and before every database write.

Before persistence:

- Column titles, card IDs, card titles, and card details are trimmed.
- Column titles, card IDs, and card titles must remain non-empty after trimming.
- Details must be a string but may become an empty string.
- Card IDs must be unique.
- Every `columnId` must be one of the five fixed IDs.
- `columns` and `cards` must be arrays.
- Missing, extra, duplicated, or reordered fixed columns are rejected.
- Missing fields, extra fields, and malformed card values are rejected.

Only the canonical Pydantic serialization is written to `state_json`. Stored JSON is parsed and passed through the same model when read. If stored data is invalid, the API returns a concise internal error and does not return or overwrite the corrupt state.

The standard JSON Schema expresses the structural rules. `x-uniqueBy` and `x-validationInvariants` in `docs/database-schema.json` record the cross-item and canonicalization rules that require Pydantic validation.

## Initialization

Initialization is idempotent and runs when the application starts:

1. Create the parent directory and database file when absent.
2. Create both tables with `CREATE TABLE IF NOT EXISTS`.
3. Insert username `user` with `INSERT OR IGNORE`.
4. Select that user's ID.
5. Insert the validated seed board with `INSERT OR IGNORE` using the unique `user_id` constraint.

Running initialization again must not replace an existing board. The complete seed state exactly matches `initialBoardState` in the frontend and is included in `docs/database-schema.json`.

The hardcoded password remains a backend authentication constant. It has no table column and is not written to SQLite.

## Ownership and API mapping

The authenticated session supplies the username. Browser URLs and request bodies never supply a user ID or username for board access.

```text
GET /api/board
  session username -> users.username -> boards.user_id -> validated BoardState

PUT /api/board
  session username + BoardState body -> validate/canonicalize -> replace that user's state_json
```

`GET /api/board` returns the canonical `BoardState` directly. `PUT /api/board` accepts the complete `BoardState`, atomically replaces it, and returns the canonical persisted state. Missing authentication returns 401; an invalid request returns 400; invalid stored data or a failed database operation returns a concise 500 without database details.

The ownership lookup is equivalent to:

```sql
SELECT b.state_json
FROM boards AS b
JOIN users AS u ON u.id = b.user_id
WHERE u.username = ?;
```

Replacement selects the same owner inside a transaction and updates exactly one board row. A missing user or board is an internal initialization error, not a reason to create a board from browser input.

## Atomic persistence

A manual replacement is validated before opening the write transaction. The write uses `BEGIN IMMEDIATE`, updates the board selected through the authenticated username, and commits only when exactly one row was updated. Any error rolls back the transaction.

A multi-operation AI request uses the same boundary:

1. Load and validate the authoritative board.
2. Apply every validated operation to an in-memory copy.
3. Validate the complete result.
4. Replace `state_json` once in one transaction.

For example, this AI result edits and moves one card and creates another:

```json
{
  "operations": [
    { "kind": "editCard", "cardId": "card-launch", "title": "Publish launch notes", "details": "Approved." },
    { "kind": "moveCard", "cardId": "card-launch", "columnId": "done" },
    { "kind": "createCard", "card": { "id": "card-ai-brief", "title": "Draft follow-up", "details": "Summarize responses.", "columnId": "todo" } }
  ],
  "resultingCardOrder": ["card-ai-brief", "card-launch"]
}
```

If any operation or the final state is invalid, no update occurs. This gives manual saves and multi-operation AI changes the same atomic guarantee.

## Worked behavior examples

The following compact JSON examples show how each board behavior maps to the whole-state representation. Complete valid result states for all examples are in `x-workedExamples` in `docs/database-schema.json`.

Column rename:

```json
{
  "operation": { "kind": "renameColumn", "columnId": "ideas", "title": "Discovery" },
  "result": { "id": "ideas", "title": "Discovery" }
}
```

Card creation, editing, and deletion:

```json
[
  { "kind": "createCard", "card": { "id": "card-new", "title": "Prepare update", "details": "", "columnId": "ideas" } },
  { "kind": "editCard", "cardId": "card-new", "title": "Publish update", "details": "Include decisions." },
  { "kind": "deleteCard", "cardId": "card-new" }
]
```

Same-column reorder is represented only by array order:

```json
{
  "operation": { "kind": "reorderCard", "cardId": "card-b", "beforeCardId": "card-a" },
  "resultingCards": [
    { "id": "card-b", "title": "Second card", "details": "", "columnId": "todo" },
    { "id": "card-a", "title": "First card", "details": "", "columnId": "todo" }
  ]
}
```

Cross-column movement changes membership and array order:

```json
{
  "operation": { "kind": "moveCard", "cardId": "card-move", "columnId": "review", "afterCardId": "card-review" },
  "resultingCards": [
    { "id": "card-review", "title": "Existing review", "details": "", "columnId": "review" },
    { "id": "card-move", "title": "Moved card", "details": "", "columnId": "review" }
  ]
}
```

A second user owns a separate row rather than sharing or nesting boards:

```json
{
  "users": [
    { "id": 1, "username": "user", "boardId": 1 },
    { "id": 2, "username": "designer", "boardId": 2 }
  ]
}
```

Because every read and replacement joins through the authenticated username, user 1 cannot select or update board 2.

## Why JSON is sufficient

The MVP always loads and saves one small board as a complete unit. It does not query cards across boards, paginate cards, collaborate concurrently, or update cards independently from the board. A validated JSON document therefore keeps the implementation and atomicity model simple.

Normalized `columns` and `cards` tables would become justified if future requirements add cross-board search, reporting across many boards, large-board pagination, independent card permissions, concurrent card-level edits, relational assignments, or database-side filtering. None is in the approved MVP.

## Explicit exclusions

- No password column or stored password.
- No sessions table; Part 4 sessions remain in process memory.
- No chat messages table or chat field in `state_json`.
- No separate column, card, position, audit, or migration-history tables for the MVP.
