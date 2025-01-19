import json
import os
import re
import warnings

from langchain_google_vertexai import ChatVertexAI, SafetySetting  # type: ignore

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

warnings.filterwarnings(
    "ignore", "Your application has authenticated using end user credentials"
)

VERTEXAI_PROJECT = os.environ.get("VERTEXAI_PROJECT", "")
assert VERTEXAI_PROJECT

VERTEXAI_MODEL = os.environ.get("VERTEXAI_MODEL", "")
assert VERTEXAI_MODEL

VERTEXAI_REGION = os.environ.get("VERTEXAI_REGION", "")
assert VERTEXAI_REGION

PRICE_UNIT = os.environ.get("PRICE_UNIT", "tokens")  # type: ignore
PRICE_USD_PER_UNIT_IN = parse_price(os.environ.get("PRICE_USD_PER_UNIT_IN", ""))
PRICE_USD_PER_UNIT_OUT = parse_price(os.environ.get("PRICE_USD_PER_UNIT_OUT", ""))

safety_settings = {  # type: ignore
    SafetySetting.HarmCategory.HARM_CATEGORY_HATE_SPEECH: SafetySetting.HarmBlockThreshold.OFF,
    SafetySetting.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: SafetySetting.HarmBlockThreshold.OFF,
    SafetySetting.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: SafetySetting.HarmBlockThreshold.OFF,
    SafetySetting.HarmCategory.HARM_CATEGORY_HARASSMENT: SafetySetting.HarmBlockThreshold.OFF,
}


class Model(ChatModel):
    def __init__(self):
        model_name = VERTEXAI_MODEL

        self._model = ChatVertexAI(
            project=VERTEXAI_PROJECT,
            location=VERTEXAI_REGION,
            model=model_name,
            temperature=0,
            max_tokens=8192,
            safety_settings=safety_settings,
            top_p=0.95,
        )

        super().__init__(
            info=GetModelReturnInfo(
                name=f"{model_name} on Vertex AI in {VERTEXAI_REGION}",
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
                    tokens=(
                        response.response_metadata  # type: ignore
                    )["usage_metadata"]["prompt_token_count"],  # type: ignore
                    not_whitespace_characters=len(re.sub(r"\s", "", prompt)),
                ),
                output=ValuesForUnits(
                    tokens=(
                        response.response_metadata  # type: ignore
                    )["usage_metadata"]["candidates_token_count"],  # type: ignore
                    not_whitespace_characters=len(re.sub(r"\s", "", text)),
                ),
            ),
        )
