import asyncio
import re
import time
import urllib.parse
from datetime import date
from typing import Any, Optional

import aiohttp
from pydantic import BaseModel

from .models.common import (
    ChatModel,
    GetModelReturnInfo,
    SendMessageReturn,
    SendMessageReturnUsage,
    ValuesForUnits,
)


def get_qac_prompt(*, question: str, count: int = 5):
    return f"""\
ユーザは、下記の「# 質問」の欄に記載された質問への回答を考えようとしています。ユーザが回答を考えるために参考になる文章を、データベースから検索しようとしています。ユーザのために、データベースを検索する検索キーワードを提案してください。出力は、下記の「# 出力形式」の欄に記載されたJSON形式として出力してください。

検索キーワードは完全一致で、複数の単語を空白で結合することでAND検索ができるものとします。

注意点として、このデータベースはあいまい検索に対応しておらず、完全一致でしか検索できないため、検索にヒットするような単語に言い換える選択肢も含めましょう。また、検索は完全一致のため、AND検索の単語数を多くしすぎると文章がヒットしません。そのため、1組のAND検索の検索キーワードに含める単語数は、最大でも2単語程度にしましょう。

回答は{count}組提案してください。

# 質問

```
{question}
```

# 出力形式

```json
{{ "queries": ["...", "..."] }}
```
"""


class QACReturn(SendMessageReturn):
    seconds: float


async def qac(*, model: ChatModel, question: str):
    t0 = time.time()
    response = await model.send_message(prompt=get_qac_prompt(question=question))
    return QACReturn(
        **response.model_dump(),
        seconds=time.time() - t0,
    )


async def http_get(url: str) -> dict[str, Any]:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.json()


def clean_speech(speech: str):
    speech = re.sub(r"\r\n", "\n", speech)
    speech = re.sub(r"^○.+?\u3000", "", speech)
    speech = re.sub(r"^\u3000", "", speech, flags=re.MULTILINE)
    return speech


# https://kokkai.ndl.go.jp/api.html


class Speech(BaseModel):
    speechID: str  # 発言ID
    issueID: str  # 会議録ID
    imageKind: str  # イメージ種別（会議録・目次・索引・附録・追録）
    searchObject: int  # 検索対象箇所（議事冒頭・本文）
    session: int  # 国会回次
    nameOfHouse: str  # 院名
    nameOfMeeting: str  # 会議名
    issue: str  # 号数
    date: date  # 開催日付
    closing: str | None  # 閉会中フラグ
    speechOrder: int  # 発言番号
    speaker: str  # 発言者名
    speakerYomi: str | None  # 発言者よみ
    speakerGroup: str | None  # 発言者所属会派
    speakerPosition: str | None  # 発言者肩書き
    speakerRole: str | None  # 発言者役割
    speech: str  # 発言
    startPage: int  # 発言が掲載されている開始ページ
    speechURL: str  # 発言URL
    meetingURL: str  # 会議録テキスト表示画面のURL
    pdfURL: str | None  # 会議録PDF表示画面のURL（※存在する場合のみ）


class SpeechWithQueries(Speech):
    queries: list[str]


class SearchNDLReturn(BaseModel):
    seconds: float
    speeches: list[SpeechWithQueries]


async def search_ndl(
    *, queries: list[str], max_count: int = 30, concurrently: bool = False
):
    t0 = time.time()

    async def search_task(query: str) -> dict[str, Any]:
        params = {
            "any": query,
            "recordPacking": "json",
            "maximumRecords": f"{max_count}",
        }
        url = f"https://kokkai.ndl.go.jp/api/speech?{urllib.parse.urlencode(params)}"
        data = await http_get(url)
        return {
            "url": url,
            "query": query,
            "data": data,
        }

    if concurrently:
        search_responses = await asyncio.gather(
            *[search_task(query) for query in queries]
        )
    else:
        search_responses = [await search_task(query) for query in queries]

    speeches_dict: dict[str, SpeechWithQueries] = {}

    for response in search_responses:
        query = response["query"]
        data = response["data"]
        if "speechRecord" in data:
            for _d in data["speechRecord"]:
                d = SpeechWithQueries(**_d, queries=[])
                if not (d.speakerPosition and not d.speakerRole):
                    continue
                if d.speechID not in speeches_dict:
                    speeches_dict[d.speechID] = d
                speeches_dict[d.speechID].queries.append(query)

    speeches = sorted(list(speeches_dict.values()), key=lambda v: v.date, reverse=True)

    return SearchNDLReturn(
        seconds=time.time() - t0,
        speeches=speeches,
    )


def get_score_prompt(*, clean_speech: str, question: str):
    return f"""\
下記の「# 文章」の欄に記載された文章は、下記の「# 質問」の欄に記載された質問にどの程度答えているか、または答えるためにどの程度参考になるか、0～100の101段階で答えてください。「100」は質問への回答にそのまま使える情報が文章に含まれている場合、「0」は全く参考にならない場合、とします。出力は、下記の「# 出力形式」の欄に記載されたJSON形式として出力してください。

# 文章

```
{clean_speech}
```

# 質問

```
{question}
```

# 出力形式

```json
{{ "score": "..." }}
```
"""


class ScoreReturn(SendMessageReturn):
    seconds: float


async def score(*, model: ChatModel, clean_speech: str, question: str):
    t0 = time.time()
    response = await model.send_message(
        prompt=get_score_prompt(clean_speech=clean_speech, question=question)
    )
    return ScoreReturn(
        **response.model_dump(),
        seconds=time.time() - t0,
    )


def get_summary_prompt(*, clean_speech: str, question: str):
    return f"""\
下記の「# 発言」の欄に記載された発言に基づいて、下記の「# 質問」の欄に記載された質問への回答やその理由、関連する背景や事実の説明に該当する部分を抜き出して、1段落にまとめてください。もしそのような部分がない場合は、「（該当箇所がありません）」と答えてください。「～でございます」のような丁寧表現は、「～です」のように簡略化してください。ただし、その他の部分については、正確な情報が失われないように、なるべく元の単語を変更しないよう注意してください。絶対に、元の発言に含まれていない内容を追加しないでください。出力は、下記の「# 出力形式」の欄に記載されたJSON形式として出力してください。

# 発言

```
{clean_speech}
```

# 質問

```
{question}
```

# 出力形式

```json
{{ "summary": "..." }}
```
"""


class SummarizeReturn(SendMessageReturn):
    seconds: float


async def summarize(*, model: ChatModel, clean_speech: str, question: str):
    t0 = time.time()
    response = await model.send_message(
        prompt=get_summary_prompt(clean_speech=clean_speech, question=question)
    )
    return SummarizeReturn(
        **response.model_dump(),
        seconds=time.time() - t0,
    )


def get_annotate_prompt(*, speech: str, summary: str):
    return f"""\
下記の「# 発言」の欄に記載された発言には、下記の「# 要素」の欄に記載された要素の内容が散らばって含まれています。そのような内容に該当する箇所を発言の中から探して、見つかった箇所をそれぞれ<u></u>タグで囲ってください。タグの追加を除いて、発言の文面は一言一句変更せず、全角・半角などの文字種も変更しないでください。出力は、下記の「# 出力形式」の欄に記載されたJSON形式（改行は"\n"）として出力してください。

# 発言

```
{speech}
```

# 要素

```
{summary}
```

# 出力形式

```json
{{ "annotated": "..." }}
```
"""


def apply_annotation(orig: str, annotated: str):
    orig = orig.replace("\r\n", "\n")
    annotated = annotated.replace("\r\n", "\n")
    chunks = re.split(r"(</?u>)", annotated)
    ret_chunks: list[str] = []
    orig_pos = 0
    for chunk in chunks:
        if re.match(r"</?u>", chunk):
            ret_chunks.append(chunk)
        else:
            ret_chunks.append(orig[orig_pos : orig_pos + len(chunk)])
            orig_pos += len(chunk)
    if orig_pos < len(orig):
        ret_chunks.append(orig[orig_pos:])
    return "".join(ret_chunks)


class AnnotateReturn(SendMessageReturn):
    seconds: float
    annotated: str


async def annotate(*, model: ChatModel, speech: str, summary: str):
    t0 = time.time()
    response = await model.send_message(
        prompt=get_annotate_prompt(speech=speech, summary=summary)
    )
    return AnnotateReturn(
        **response.model_dump(),
        seconds=time.time() - t0,
        annotated=apply_annotation(speech, response.responseJson["annotated"]),
    )


class SplitSpeechReturn(BaseModel):
    speeches: list[tuple[str, int, int]]


def split_speech(
    *,
    speech: str,
    queries: list[str],
    max_speech_length: int = 1000,
):
    shift = max_speech_length // 2
    speeches: list[tuple[str, int, int]] = []
    for i in range(0, len(speech), shift):
        s = speech[i : i + max_speech_length]
        for query in queries:
            if query not in s:
                break
        speeches.append((s, i, i + len(s)))
    return SplitSpeechReturn(speeches=speeches)


class SpeechWithScore(SpeechWithQueries):
    score: int | float
    length: int
    partial: tuple[int, int] | None


class SearchSpeechesReturn(BaseModel):
    chat_model_info: GetModelReturnInfo
    queries: list[str]
    speeches: list[SpeechWithScore]
    usage: dict[str, SendMessageReturnUsage]
    seconds: dict[str, int | float]


class SearchSpeechesStreamProgress(BaseModel):
    progress: str
    chat_model_info: Optional[GetModelReturnInfo] = None
    queries: Optional[list[str]] = None
    speeches_length: Optional[int] = None
    usage: dict[str, SendMessageReturnUsage] = {}
    seconds: dict[str, int | float] = {}


async def search_speeches_stream(
    *,
    model: ChatModel,
    question: str,
    max_count: int = 50,
    max_speech_length: int = 1000,
    print_message: bool = False,
):
    usage: dict[str, SendMessageReturnUsage] = {}
    seconds: dict[str, int | float] = {}

    yield SearchSpeechesStreamProgress(
        progress="Generating queries...",
        chat_model_info=model.info,
        usage=usage,
        seconds=seconds,
    )

    if print_message:
        print("qac...")
    qac_response = await qac(model=model, question=question)
    queries = qac_response.responseJson["queries"]
    usage["qac"] = qac_response.usage
    seconds["qac"] = qac_response.seconds

    yield SearchSpeechesStreamProgress(
        progress="Searching speeches...",
        chat_model_info=model.info,
        queries=queries,
        usage=usage,
        seconds=seconds,
    )

    if print_message:
        print("search_ndl...")
    search_ndl_response = await search_ndl(queries=queries)
    seconds["search_ndl"] = search_ndl_response.seconds
    speeches: list[SpeechWithScore] = []

    for speech_dict in map(
        lambda s: SpeechWithScore(
            **s.model_dump(),
            score=0,
            length=len(s.speech),
            partial=None,
        ),
        search_ndl_response.speeches[0:max_count],
    ):
        speech = speech_dict.speech
        if len(speech) > max_speech_length:
            for s in split_speech(
                speech=speech,
                queries=speech_dict.queries,
                max_speech_length=max_speech_length,
            ).speeches:
                d = speech_dict.model_dump()
                d["speech"] = s[0]
                d["partial"] = s[1:]
                speech_dict = SpeechWithScore(**d)
                speeches.append(speech_dict)
        else:
            speeches.append(speech_dict)

    yield SearchSpeechesStreamProgress(
        progress="Scoring speeches...",
        chat_model_info=model.info,
        queries=queries,
        speeches_length=len(speeches),
        usage=usage,
        seconds=seconds,
    )

    if print_message:
        print("score...")
    t0 = time.time()

    async def score_task(speech_dict: SpeechWithScore, question: str):
        score_response = await score(
            model=model,
            clean_speech=clean_speech(speech_dict.speech),
            question=question,
        )
        speech_dict.score = score_response.responseJson["score"]
        return score_response

    score_responses = await asyncio.gather(*[score_task(d, question) for d in speeches])
    usage["score"] = SendMessageReturnUsage(
        **{
            k: ValuesForUnits(
                **{
                    j: sum((r.usage.model_dump()[k][j] for r in score_responses), 0)
                    for j in ValuesForUnits.model_fields.keys()
                }
            )
            for k in SendMessageReturnUsage.model_fields.keys()
        }
    )
    seconds["score"] = time.time() - t0

    yield SearchSpeechesReturn(
        chat_model_info=model.info,
        queries=queries,
        speeches=sorted(speeches, key=lambda s: s.score, reverse=True),
        usage=usage,
        seconds=seconds,
    )


class SummarizeSpeechReturn(BaseModel):
    chat_model_info: GetModelReturnInfo
    summary: str
    annotated: str
    usage: dict[str, SendMessageReturnUsage]
    seconds: dict[str, int | float]


class SummarizeSpeechStreamProgress(BaseModel):
    progress: str
    chat_model_info: Optional[GetModelReturnInfo] = None
    summary: Optional[str] = None
    annotated: Optional[str] = None
    usage: dict[str, SendMessageReturnUsage] = {}
    seconds: dict[str, int | float] = {}


async def summarize_speech_stream(
    model: ChatModel, question: str, speech: str, *, print_message: bool = False
):
    usage: dict[str, SendMessageReturnUsage] = {}
    seconds: dict[str, int | float] = {}

    yield SummarizeSpeechStreamProgress(
        progress="Summarizing speech...",
        chat_model_info=model.info,
        usage=usage,
        seconds=seconds,
    )

    if print_message:
        print("summarize...")
    summarize_response = await summarize(
        model=model, clean_speech=clean_speech(speech), question=question
    )
    usage["summarize"] = summarize_response.usage
    seconds["summarize"] = summarize_response.seconds
    summary = summarize_response.responseJson["summary"]

    yield SummarizeSpeechStreamProgress(
        progress="Annotating speech...",
        chat_model_info=model.info,
        summary=summary,
        usage=usage,
        seconds=seconds,
    )

    if print_message:
        print("annotate...")
    annotate_response = await annotate(model=model, speech=speech, summary=summary)
    usage["annotate"] = annotate_response.usage
    seconds["annotate"] = annotate_response.seconds
    annotated = annotate_response.annotated

    yield SummarizeSpeechReturn(
        chat_model_info=model.info,
        summary=summary,
        annotated=annotated,
        usage=usage,
        seconds=seconds,
    )
