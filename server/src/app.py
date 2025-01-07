import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from fastapi_cache.decorator import cache

load_dotenv("../container-mount/.env")
# ruff: noqa: E402
from . import agent, auth
from .models import get_model
from .models.common import ChatModel

_model: ChatModel | None = None


def model():
    global _model
    if _model is None:
        model = os.environ.get("MODEL", "")
        _model = get_model(model)
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
    result = await agent.search_speeches(
        model=model(), question=question, print_message=True
    )
    return result


@app.get(
    "/summarize_speech",
    response_model=agent.SummarizeSpeechReturn,
    dependencies=[Depends(auth.verify_authorization)],
)
@cache(expire=3600)
async def summarize_speech(question: str, speech: str):
    result = await agent.summarize_speech(
        model=model(), question=question, speech=speech, print_message=True
    )
    return result


@app.get("/auth_settings", response_model=auth.AuthSettings)
async def auth_settings():
    return auth.AUTH_SETTINGS


static_dir = Path("../client/out").resolve()
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir), name="client")
