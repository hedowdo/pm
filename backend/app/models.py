from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ColumnId = Literal["ideas", "todo", "in-progress", "review", "done"]
FIXED_COLUMN_IDS: tuple[ColumnId, ...] = (
    "ideas",
    "todo",
    "in-progress",
    "review",
    "done",
)


class BoardColumn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: ColumnId
    title: str

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value: object) -> object:
        return _trim_required(value, "Column title")


class KanbanCard(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)

    id: str
    title: str
    details: str
    column_id: ColumnId = Field(alias="columnId")

    @field_validator("id", "title", mode="before")
    @classmethod
    def trim_required_text(cls, value: object) -> object:
        return _trim_required(value, "Card id and title")

    @field_validator("details", mode="before")
    @classmethod
    def trim_details(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class BoardState(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    columns: list[BoardColumn]
    cards: list[KanbanCard]

    @model_validator(mode="after")
    def validate_board(self) -> Self:
        column_ids = tuple(column.id for column in self.columns)
        if column_ids != FIXED_COLUMN_IDS:
            raise ValueError("Board columns must use the fixed ids in order")

        card_ids = [card.id for card in self.cards]
        if len(card_ids) != len(set(card_ids)):
            raise ValueError("Card ids must be unique")
        return self


def _trim_required(value: object, label: str) -> object:
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{label} cannot be blank")
    return trimmed
