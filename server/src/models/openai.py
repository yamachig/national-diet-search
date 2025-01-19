import json
import os
import re

from langchain_core.utils.utils import secret_from_env
from langchain_openai import ChatOpenAI

from .common import (
    ChatModel,
    GetModelReturnInfo,
    GetModelReturnInfoPrice,
    SendMessageReturn,
    SendMessageReturnUsage,
    UnitPriceForDirection,
    ValuesForUnits,
    parse_price,
)

OPENAI_APIKEY = secret_from_env("OPENAI_APIKEY")

OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "")
assert OPENAI_MODEL

PRICE_UNIT = os.environ.get("PRICE_UNIT", "tokens")  # type: ignore
PRICE_USD_PER_UNIT_IN = parse_price(os.environ.get("PRICE_USD_PER_UNIT_IN", ""))
PRICE_USD_PER_UNIT_OUT = parse_price(os.environ.get("PRICE_USD_PER_UNIT_OUT", ""))


class Model(ChatModel):
    def __init__(self):
        model_name = OPENAI_MODEL

        self._model = ChatOpenAI(
            api_key=OPENAI_APIKEY(),
            model=model_name,
            temperature=0,
            max_tokens=8192,
            top_p=0.95,
        )

        super().__init__(
            info=GetModelReturnInfo(
                name=f"{model_name} on OpenAI",
                price=GetModelReturnInfoPrice(
                    unit=PRICE_UNIT,  # type: ignore
                    unit_usd=UnitPriceForDirection(
                        input=PRICE_USD_PER_UNIT_IN,
                        output=PRICE_USD_PER_UNIT_OUT,
                    ),
                )
                if (
                    PRICE_USD_PER_UNIT_IN is not None
                    and PRICE_USD_PER_UNIT_OUT is not None
                )
                else None,
            ),
        )

    @property
    def model(self):
        return self._model

    async def send_message(self, *, prompt: str):
        response = await self.model.ainvoke(
            [("human", prompt)],
        )
        text: str = (
            response.content  # type: ignore
        )
        m = re.match(r"```json(.+?)```", text, re.DOTALL)
        return SendMessageReturn(
            response=response,
            responseText=text,
            responseJson=json.loads(m.group(1)) if m else {},
            usage=SendMessageReturnUsage(
                input=ValuesForUnits(
                    tokens=response.usage_metadata["input_tokens"],  # type: ignore
                    not_whitespace_characters=len(re.sub(r"\s", "", prompt)),
                ),
                output=ValuesForUnits(
                    tokens=response.usage_metadata["output_tokens"],  # type: ignore
                    not_whitespace_characters=len(re.sub(r"\s", "", text)),
                ),
            ),
        )
