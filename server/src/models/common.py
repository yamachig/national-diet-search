from abc import ABC, abstractmethod
from typing import Any, Literal

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages.base import BaseMessage
from pydantic import BaseModel

UnitType = Literal["tokens", "not_whitespace_characters"]


class ValuesForUnits(BaseModel):
    tokens: int | float
    not_whitespace_characters: int | float


class SendMessageReturnUsage(BaseModel):
    input: ValuesForUnits
    output: ValuesForUnits


class SendMessageReturn(BaseModel):
    response: BaseMessage
    responseText: str
    responseJson: dict[str, Any]
    usage: SendMessageReturnUsage


class UnitPriceForDirection(BaseModel):
    input: float
    output: float


class GetModelReturnInfoPrice(BaseModel):
    unit: UnitType
    unit_usd: UnitPriceForDirection


class GetModelReturnInfo(BaseModel):
    name: str
    price: GetModelReturnInfoPrice | None


class ChatModel(ABC):
    info: GetModelReturnInfo

    def __init__(self, *, info: GetModelReturnInfo):
        self.info = info

    @property
    @abstractmethod
    def model(self) -> BaseChatModel:
        raise NotImplementedError

    @abstractmethod
    async def send_message(self, *, prompt: str) -> SendMessageReturn:
        raise NotImplementedError


def parse_price(orig: str):
    if orig.strip() == "":
        return None
    numbers = [float(s.strip().replace("_", "")) for s in orig.split("/")]
    match len(numbers):
        case 1:
            return numbers[0]
        case 2:
            return numbers[0] / numbers[1]
        case _:
            return None
