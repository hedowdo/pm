from collections.abc import Callable
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator

from app.models import BoardState, ColumnId, KanbanCard


ASSISTANT_RESPONSE_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "message": {"type": "string"},
        "operations": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["message", "operations"],
    "additionalProperties": False,
}


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    role: Literal["user", "assistant"]
    content: str

    @field_validator("content", mode="before")
    @classmethod
    def trim_content(cls, value: object) -> object:
        return _trim_required(value, "Message")


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: str
    history: list[ChatMessage] = Field(default_factory=list)

    @field_validator("message", mode="before")
    @classmethod
    def trim_message(cls, value: object) -> object:
        return _trim_required(value, "Message")


class CreateCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)

    type: Literal["create_card"]
    title: str
    details: str
    column_id: ColumnId = Field(alias="columnId")
    position: int = Field(ge=0)

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value: object) -> object:
        return _trim_required(value, "Card title")

    @field_validator("details", mode="before")
    @classmethod
    def trim_details(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class EditCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)

    type: Literal["edit_card"]
    card_id: str = Field(alias="cardId")
    title: str
    details: str

    @field_validator("card_id", "title", mode="before")
    @classmethod
    def trim_required_text(cls, value: object) -> object:
        return _trim_required(value, "Card id and title")

    @field_validator("details", mode="before")
    @classmethod
    def trim_details(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class MoveCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)

    type: Literal["move_card"]
    card_id: str = Field(alias="cardId")
    column_id: ColumnId = Field(alias="columnId")
    position: int = Field(ge=0)

    @field_validator("card_id", mode="before")
    @classmethod
    def trim_card_id(cls, value: object) -> object:
        return _trim_required(value, "Card id")


BoardOperation = Annotated[
    CreateCardOperation | EditCardOperation | MoveCardOperation,
    Field(discriminator="type"),
]


class AssistantBoardResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: str
    operations: list[BoardOperation]

    @field_validator("message", mode="before")
    @classmethod
    def trim_message(cls, value: object) -> object:
        return _trim_required(value, "Assistant message")


class ProviderBoardResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: str
    operations: list[str]

    def to_assistant_response(self) -> AssistantBoardResponse:
        return AssistantBoardResponse(
            message=self.message,
            operations=[
                BOARD_OPERATION_ADAPTER.validate_json(operation)
                for operation in self.operations
            ],
        )


BOARD_OPERATION_ADAPTER = TypeAdapter(BoardOperation)


class AppliedOperation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: Literal["create_card", "edit_card", "move_card"]
    card_id: str = Field(alias="cardId")


class ChatResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message: str
    applied_operations: list[AppliedOperation] = Field(alias="appliedOperations")
    board: BoardState


class AIResponseError(ValueError):
    pass


def generate_card_id() -> str:
    return f"card-{uuid4().hex}"


def apply_board_operations(
    board: BoardState,
    operations: list[BoardOperation],
    id_factory: Callable[[], str] = generate_card_id,
) -> tuple[BoardState, list[AppliedOperation]]:
    original_ids = {card.id for card in board.cards}
    cards = list(board.cards)
    applied: list[AppliedOperation] = []

    for operation in operations:
        if isinstance(operation, CreateCardOperation):
            card_id = id_factory()
            if card_id in {card.id for card in cards}:
                raise AIResponseError("Generated card id is not unique")
            card = KanbanCard(
                id=card_id,
                title=operation.title,
                details=operation.details,
                columnId=operation.column_id,
            )
            cards = _insert_card(
                cards,
                card,
                operation.column_id,
                operation.position,
            )
        elif isinstance(operation, EditCardOperation):
            _require_original_card(operation.card_id, original_ids)
            index = _card_index(cards, operation.card_id)
            current = cards[index]
            cards[index] = KanbanCard(
                id=current.id,
                title=operation.title,
                details=operation.details,
                columnId=current.column_id,
            )
            card_id = operation.card_id
        else:
            _require_original_card(operation.card_id, original_ids)
            index = _card_index(cards, operation.card_id)
            current = cards.pop(index)
            moved = KanbanCard(
                id=current.id,
                title=current.title,
                details=current.details,
                columnId=operation.column_id,
            )
            cards = _insert_card(
                cards,
                moved,
                operation.column_id,
                operation.position,
            )
            card_id = operation.card_id

        applied.append(AppliedOperation(type=operation.type, cardId=card_id))

    updated = BoardState(columns=board.columns, cards=cards)
    return updated, applied


def _require_original_card(card_id: str, original_ids: set[str]) -> None:
    if card_id not in original_ids:
        raise AIResponseError("Operation references an unknown or newly created card")


def _card_index(cards: list[KanbanCard], card_id: str) -> int:
    for index, card in enumerate(cards):
        if card.id == card_id:
            return index
    raise AIResponseError("Operation references an unavailable card")


def _insert_card(
    cards: list[KanbanCard],
    card: KanbanCard,
    column_id: ColumnId,
    position: int,
) -> list[KanbanCard]:
    target_indices = [
        index for index, current in enumerate(cards) if current.column_id == column_id
    ]
    if position > len(target_indices):
        raise AIResponseError("Operation position is outside the target column")

    if position < len(target_indices):
        insertion_index = target_indices[position]
    elif target_indices:
        insertion_index = target_indices[-1] + 1
    else:
        insertion_index = len(cards)

    updated = list(cards)
    updated.insert(insertion_index, card)
    return updated


def _trim_required(value: object, label: str) -> object:
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{label} cannot be blank")
    return trimmed
