import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Union

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from fastapi_cache.decorator import cache
from langchain.globals import set_llm_cache
from langchain_community.cache import InMemoryCache

load_dotenv("../container-mount/.env")
# ruff: noqa: E402

from . import agent, auth
from .models import get_model as orig_get_model
from .models.common import ChatModel

set_llm_cache(InMemoryCache())

_model: ChatModel | None = None


async def get_model():
    global _model
    if _model is None:
        await asyncio.sleep(0.01)
        model = os.environ.get("MODEL", "")
        _model = orig_get_model(model)
    return _model


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    FastAPICache.init(InMemoryBackend(), prefix="fastapi-cache")
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/search_speeches",
    response_model=agent.SearchSpeechesReturn,
    dependencies=[Depends(auth.verify_authorization)],
)
@cache(expire=3600)
async def search_speeches(question: str):
    model = await get_model()
    result = None
    async for progress in agent.search_speeches_stream(  # type: ignore
        model=model, question=question, print_message=True
    ):
        result = progress
    return result


@app.get(
    "/search_speeches_stream",
    response_model=Union[
        agent.SearchSpeechesStreamProgress,
        agent.SearchSpeechesReturn,
    ],
    dependencies=[Depends(auth.verify_authorization)],
)
async def search_speeches_stream(question: str):
    async def inner():
        yield agent.SearchSpeechesStreamProgress(
            progress="Initializing...",
        )
        model = await get_model()
        async for progress in agent.search_speeches_stream(  # type: ignore
            model=model, question=question, print_message=True
        ):
            yield progress

    async def content():
        async for progress in inner():
            yield f"data:{progress.model_dump_json()}\n\n"

    return StreamingResponse(
        content=content(),  # type: ignore
        media_type="text/event-stream",
    )


@app.get(
    "/summarize_speech",
    response_model=agent.SummarizeSpeechReturn,
    dependencies=[Depends(auth.verify_authorization)],
)
@cache(expire=3600)
async def summarize_speech(question: str, speech: str):
    model = await get_model()
    result = None
    async for progress in agent.summarize_speech_stream(  # type: ignore
        model=model, question=question, speech=speech, print_message=True
    ):
        result = progress
    return result


@app.get(
    "/summarize_speech_stream",
    response_model=Union[
        agent.SummarizeSpeechStreamProgress,
        agent.SummarizeSpeechReturn,
    ],
    dependencies=[Depends(auth.verify_authorization)],
)
async def summarize_speech_stream(question: str, speech: str):
    async def inner():
        yield agent.SummarizeSpeechStreamProgress(
            progress="Initializing...",
        )
        model = await get_model()
        async for progress in agent.summarize_speech_stream(  # type: ignore
            model=model, question=question, speech=speech, print_message=True
        ):
            yield progress

    async def content():
        async for progress in inner():
            yield f"data:{progress.model_dump_json()}\n\n"

    return StreamingResponse(
        content=content(),  # type: ignore
        media_type="text/event-stream",
    )


@app.get("/auth_settings", response_model=auth.AuthSettings)
async def auth_settings():
    return auth.AUTH_SETTINGS


static_dir = Path("../client/out").resolve()
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir), name="client")
