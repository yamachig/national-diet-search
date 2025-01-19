/* eslint-disable no-irregular-whitespace */
"use client";

import React from "react";
import createClient from "openapi-fetch";
import type { paths } from "../serverSchema";
import { useAuth } from "../lib/auth";
import { EventSource } from "eventsource";

interface State {
  question: string | null,
  searchSpeechesResult: {
    completedKey: {
        question: string,
    } | null,
    data: paths["/search_speeches_stream"]["get"]["responses"][200]["content"]["application/json"],
} | null,
  selectedSpeechIDPos: [string, number] | null,
  summarizeSpeechResult: {
    data: paths["/summarize_speech_stream"]["get"]["responses"][200]["content"]["application/json"],
    completedKey: {
        question: string,
        id: string,
        pos: number,
    } | null,
  } | null,
}

const NEXT_PUBLIC_API_HOST = process.env.NEXT_PUBLIC_API_HOST ?? "";

const client = createClient<paths>({ baseUrl: `${NEXT_PUBLIC_API_HOST}/` });

export default function Home() {
    const { authSettings, authStatus, signIn } = useAuth(client);

    const loginButtonOnClick: React.MouseEventHandler<HTMLButtonElement> = React.useCallback(() => {
        signIn();
    }, [signIn]);

    const [
        {
            question,
            searchSpeechesResult,
            selectedSpeechIDPos,
            summarizeSpeechResult,
        }, setState,
    ] = React.useState<State>({
        question: null,
        searchSpeechesResult: null,
        selectedSpeechIDPos: null,
        summarizeSpeechResult: null,
    });

    const onSubmit: React.FormEventHandler<HTMLFormElement> = React.useCallback((e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const question = formData.get("question") as string | null;
        setState(origState => ({
            ...origState,
            question,
            searchSpeechesResult: null,
            selectedSpeechIDPos: null,
            summarizeSpeechResult: null,
        }));
    }, []);

    React.useEffect(() => {
        if (question === null || searchSpeechesResult?.completedKey?.question === question) return;
        if (!authSettings || (authSettings.type !== "none" && !authStatus?.currentUser)) return;
        const eventSource = new EventSource(`${NEXT_PUBLIC_API_HOST}/search_speeches_stream?question=${encodeURIComponent(question)}`, {
            fetch: (input, init) =>
                fetch(input, {
                    ...init,
                    ...(
                        (authSettings.type !== "none" && authStatus?.currentUser)
                            ? {
                                headers: {
                                    ...init?.headers,
                                    Authorization: `Bearer ${authStatus.currentUser.token}`,
                                },
                            } : {}
                    ),
                }),
        });
        setTimeout(() => {
            eventSource.close();
        }, 40000);
        eventSource.addEventListener("error", () => {
            console.log("error event received");
            eventSource.close();
        });
        eventSource.addEventListener("message", (event) => {
            const data = JSON.parse(event.data);
            if (!("progress" in data)) {
                eventSource.close();
            }
            setState(origState => ({
                ...origState,
                searchSpeechesResult: {
                    completedKey: (!("progress" in data) ? { question } : null),
                    data,
                },
                selectedSpeechIDPos: (data.speeches && data.speeches[0]) ? [data.speeches[0].speechID, data.speeches[0].partial?.[0] ?? 0] : null,
                summarizeSpeechResult: null,
            }));
        });
        return () => {
            eventSource.close();
        };
    }, [authSettings, authStatus, question, searchSpeechesResult?.completedKey?.question]);


    React.useEffect(() => {
        if (
            selectedSpeechIDPos === null ||
            searchSpeechesResult === null ||
            !("speeches" in searchSpeechesResult.data) ||
            (
                selectedSpeechIDPos &&
                question === summarizeSpeechResult?.completedKey?.question &&
                selectedSpeechIDPos[0] === summarizeSpeechResult?.completedKey?.id &&
                selectedSpeechIDPos[1] === summarizeSpeechResult?.completedKey?.pos
            )
        ) return;
        const speech = searchSpeechesResult.data.speeches.find((s) => s.speechID === selectedSpeechIDPos[0] && (s.partial?.[0] ?? 0) === selectedSpeechIDPos[1]);
        if (!speech || !question) return;

        if (!authSettings || (authSettings.type !== "none" && !authStatus?.currentUser)) return;
        const eventSource = new EventSource(`${NEXT_PUBLIC_API_HOST}/summarize_speech_stream?question=${encodeURIComponent(question)}&speech=${encodeURIComponent(speech.speech)}`, {
            fetch: (input, init) =>
                fetch(input, {
                    ...init,
                    ...(
                        (authSettings.type !== "none" && authStatus?.currentUser)
                            ? {
                                headers: {
                                    ...init?.headers,
                                    Authorization: `Bearer ${authStatus.currentUser.token}`,
                                },
                            } : {}
                    ),
                }),
        });
        setTimeout(() => {
            eventSource.close();
        }, 40000);
        eventSource.addEventListener("error", () => {
            console.log("error event received");
            eventSource.close();
        });
        eventSource.addEventListener("message", (event) => {
            const data = JSON.parse(event.data);
            if (!("progress" in data)) {
                eventSource.close();
            }
            setState(origState => ({
                ...origState,
                summarizeSpeechResult: {
                    completedKey: (!("progress" in data) ? { question, id: selectedSpeechIDPos[0], pos: selectedSpeechIDPos[1] } : null),
                    data,
                },
            }));
        });
        return () => {
            eventSource.close();
        };
    }, [authSettings, authStatus, question, searchSpeechesResult, selectedSpeechIDPos, summarizeSpeechResult?.completedKey?.id, summarizeSpeechResult?.completedKey?.pos, summarizeSpeechResult?.completedKey?.question]);

    const searchSpeechesUsage = React.useMemo(() => {
        if (!searchSpeechesResult || Object.keys(searchSpeechesResult.data.usage).length === 0) return null;
        const ret = {} as (typeof searchSpeechesResult.data.usage)[string];
        const allUsage = searchSpeechesResult.data.usage;
        for (const usage of Object.values(allUsage)) {
            for (const [_direction, value] of Object.entries(usage)) {
                const direction = _direction as keyof typeof usage;
                if (ret[direction] === undefined) {
                    ret[direction] = { ...value };
                } else {
                    for (const [_key, val] of Object.entries(value)) {
                        const key = _key as keyof typeof value;
                        ret[direction][key] += val;
                    }
                }
            }
        }
        return ret;
    }, [searchSpeechesResult]);

    const searchSpeechesCost = React.useMemo(() => {
        if (!searchSpeechesResult?.data.chat_model_info?.price || !searchSpeechesUsage) return null;
        const price = searchSpeechesResult.data.chat_model_info.price;
        const directionUSD = {} as { [K in keyof (typeof searchSpeechesResult.data.usage)[string]]: number };
        for (const [_direction, usage] of Object.entries(searchSpeechesUsage)) {
            const direction = _direction as keyof (typeof searchSpeechesResult.data.usage)[string];
            if (directionUSD[direction] === undefined) directionUSD[direction] = 0;
            directionUSD[direction] += usage[price.unit] * searchSpeechesResult.data.chat_model_info.price.unit_usd[direction];
        }
        const totalUSD = Object.values(directionUSD).reduce((a, b) => a + b, 0);
        return {
            price,
            unitDisplayName: {
                "tokens": "トークン",
                "not_whitespace_characters": "文字",
            }[price.unit],
            directionUSD,
            totalUSD,
        };
    }, [searchSpeechesResult, searchSpeechesUsage]);

    const summarizeSpeechUsage = React.useMemo(() => {
        if (!summarizeSpeechResult || Object.keys(summarizeSpeechResult.data.usage).length === 0) return null;
        const ret = {} as (typeof summarizeSpeechResult.data.usage)[string];
        const allUsage = summarizeSpeechResult.data.usage;
        for (const usage of Object.values(allUsage)) {
            for (const [_direction, value] of Object.entries(usage)) {
                const direction = _direction as keyof typeof usage;
                if (ret[direction] === undefined) {
                    ret[direction] = { ...value };
                } else {
                    for (const [_key, val] of Object.entries(value)) {
                        const key = _key as keyof typeof value;
                        ret[direction][key] += val;
                    }
                }
            }
        }
        return ret;
    }, [summarizeSpeechResult]);

    const summarizeSpeechCost = React.useMemo(() => {
        if (!summarizeSpeechResult?.data.chat_model_info?.price || !summarizeSpeechUsage) return null;
        const price = summarizeSpeechResult.data.chat_model_info.price;
        const directionUSD = {} as { [K in keyof (typeof summarizeSpeechResult.data.usage)[string]]: number };
        for (const [_direction, usage] of Object.entries(summarizeSpeechUsage)) {
            const direction = _direction as keyof (typeof summarizeSpeechResult.data.usage)[string];
            if (directionUSD[direction] === undefined) directionUSD[direction] = 0;
            directionUSD[direction] += usage[price.unit] * summarizeSpeechResult.data.chat_model_info.price.unit_usd[direction];
        }
        const totalUSD = Object.values(directionUSD).reduce((a, b) => a + b, 0);
        return {
            price,
            unitDisplayName: {
                "tokens": "トークン",
                "not_whitespace_characters": "文字",
            }[price.unit],
            directionUSD,
            totalUSD,
        };
    }, [summarizeSpeechResult, summarizeSpeechUsage]);

    const costFormatter = React.useMemo(() => new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 6, minimumFractionDigits: 6 }), []);

    const tokensFormatter = React.useMemo(() => new Intl.NumberFormat("ja-JP", { useGrouping: true }), []);

    if (!authSettings || (authSettings.type !== "none" && !authStatus)) {
        return (
            <div className="container mx-auto flex h-screen max-h-screen flex-col" style={{ fontFamily: "Noto Sans JP, Meiryo" }}>
                <div className="mx-12 mt-5 w-auto grow-0">
                    <div className="flex-1 animate-pulse space-y-6 py-1">
                        <span>Loading...</span>
                    </div>
                </div>
            </div>
        );
    } else if (authSettings.type !== "none" && !authStatus?.currentUser) {
        return (
            <div className="container mx-auto flex h-screen max-h-screen flex-col" style={{ fontFamily: "Noto Sans JP, Meiryo" }}>
                <div className="mx-12 mt-5 w-auto grow-0">
                    <div className="flex-1 space-y-6 py-1">
                        <button className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700" onClick={loginButtonOnClick}>Log in</button>
                    </div>
                </div>
            </div>
        );
    } else {
        return (
            <div className="container mx-auto flex h-screen max-h-screen flex-col" style={{ fontFamily: "Noto Sans JP, Meiryo" }}>
                <div className="mx-12 w-auto grow-0">
                    <form className="mt-5 w-full" onSubmit={onSubmit}>
                        <div className="flex w-full items-center rounded border border-zinc-500 py-2">
                            <input className="mr-3 w-full appearance-none border-none bg-transparent px-2 py-1 leading-tight text-gray-700 focus:outline-none" type="text" placeholder="質問を入力してください" name="question"/>
                            <button className="mr-2 shrink-0 rounded border-4 border-zinc-500 bg-zinc-500 px-2 py-1 text-sm text-white hover:border-zinc-700 hover:bg-zinc-700" type="submit">
              検索
                            </button>
                        </div>
                    </form>
                </div>

                <div className="mt-6 flex h-1/2 grow flex-row">

                    <div className="basis-1/2 overflow-y-auto px-4">
                        {(question !== null && (!searchSpeechesResult || !("speeches" in searchSpeechesResult.data))) && <div className="animate-pulse">
                            <div className="flex-1 space-y-6 py-1">
                                <div className="h-2 rounded bg-slate-200"></div>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-2 h-2 rounded bg-slate-200"></div>
                                        <div className="col-span-1 h-2 rounded bg-slate-200"></div>
                                    </div>
                                    <div className="h-2 rounded bg-slate-200"></div>
                                </div>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-1 h-2 rounded bg-slate-200"></div>
                                        <div className="col-span-2 h-2 rounded bg-slate-200"></div>
                                    </div>
                                    <div className="h-2 rounded bg-slate-200"></div>
                                </div>
                            </div>
                        </div>}
                        {searchSpeechesResult && ("progress" in searchSpeechesResult.data) && <div className="animate-pulse">
                            <div className="flex-1 space-y-6 py-1 text-slate-600">
                                {searchSpeechesResult.data.progress}
                            </div>
                        </div>}
                        {searchSpeechesResult && ("speeches" in searchSpeechesResult.data) && searchSpeechesResult.data.speeches.map((speech, key) => {
                            const isSeleted = selectedSpeechIDPos && speech.speechID === selectedSpeechIDPos[0] && (speech.partial?.[0] ?? 0) === selectedSpeechIDPos[1];
                            return (
                                <div className={`mb-4 rounded p-4 ${isSeleted ? "bg-zinc-100" : "hover:bg-zinc-50"}`} key={key} onClick={() => { if (!isSeleted) setState(s => ({ ...s, selectedSpeechIDPos: [speech.speechID, speech.partial?.[0] ?? 0], summarizeSpeechResult: null })); }}>
                                    <div className="mb-2 text-sm">
                                        <span className="mr-1 rounded bg-zinc-200 p-1 text-xs">{speech.score}%</span><a href={`https://kokkai.ndl.go.jp/#/detail?minId=${speech.issueID}&spkNum=${speech.speechOrder}`} target="_blank" className="text-sky-700 hover:underline" rel="noreferrer">{speech.date}／{speech.nameOfHouse} {speech.nameOfMeeting}／{speech.speaker} {speech.speakerPosition}</a>
                                    </div>
                                    {(isSeleted && summarizeSpeechResult?.data.annotated) ? (
                                        <pre className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: summarizeSpeechResult.data.annotated.replace("\n", "<br/>") }}></pre>
                                    ) : (
                                        <pre className="whitespace-pre-wrap text-sm">{speech.speech}</pre>
                                    )}
                                    <div className="mb-2 text-right text-sm">
                                        {speech.partial && (<span className="mr-1 rounded bg-slate-300 p-1 text-xs">{speech.partial[0] + 1}-{speech.partial[1]}/{speech.length}文字</span>)}
                                検索キーワード：{speech.queries.map((q: string) => <span className="mr-1 rounded bg-white p-1 text-xs">{q}</span>)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex basis-1/2 flex-col">
                        <div className="h-1/2 grow overflow-y-auto px-4">
                            {summarizeSpeechResult && summarizeSpeechResult.data.summary && <>
                                <ul className="text-xl">
                                    {summarizeSpeechResult.data.summary.split(/(?<=。)/).map((sentence, key) => <li className="mb-4 pl-4 -indent-4" key={key}>○　{sentence}</li>)}
                                </ul>
                            </>}
                            {(selectedSpeechIDPos !== null && !summarizeSpeechResult?.data.summary) && <div className="animate-pulse">
                                <div className="flex-1 space-y-6 py-1">
                                    <div className="h-2 rounded bg-slate-200"></div>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="col-span-2 h-2 rounded bg-slate-200"></div>
                                            <div className="col-span-1 h-2 rounded bg-slate-200"></div>
                                        </div>
                                        <div className="h-2 rounded bg-slate-200"></div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="col-span-1 h-2 rounded bg-slate-200"></div>
                                            <div className="col-span-2 h-2 rounded bg-slate-200"></div>
                                        </div>
                                        <div className="h-2 rounded bg-slate-200"></div>
                                    </div>
                                </div>
                            </div>}
                            {summarizeSpeechResult && ("progress" in summarizeSpeechResult.data) && <div className="animate-pulse">
                                <div className="flex-1 space-y-6 py-1 text-slate-600">
                                    {summarizeSpeechResult.data.progress}
                                </div>
                            </div>}
                        </div>
                        {(searchSpeechesResult || summarizeSpeechResult) &&
            <div className="grow-0 bg-zinc-100 p-4">
                <ul>
                    {searchSpeechesResult?.data.queries && <>
                        <li className="text-sm">検索キーワード：{searchSpeechesResult.data.queries.map((q: string) => <span className="mr-1 inline-block rounded bg-white p-1 text-xs">{q}</span>)}</li>
                    </>}
                    {searchSpeechesUsage && (
                        <li className="text-sm">
                            検索時：
                            {
                                searchSpeechesCost
                                    ? (<>{costFormatter.format(searchSpeechesCost.totalUSD)} USD（試算）、入力 {tokensFormatter.format(searchSpeechesUsage.input[searchSpeechesCost.price.unit])} {searchSpeechesCost.unitDisplayName}、出力 {tokensFormatter.format(searchSpeechesUsage.output[searchSpeechesCost.price.unit])} {searchSpeechesCost.unitDisplayName}</>)
                                    : (<>入力 {tokensFormatter.format(searchSpeechesUsage.input.tokens)} トークン、出力 {tokensFormatter.format(searchSpeechesUsage.output.tokens)} トークン</>)
                            }
                            {searchSpeechesResult?.data.chat_model_info && `、モデル：${searchSpeechesResult.data.chat_model_info.name}`}
                        </li>
                    )}
                    {summarizeSpeechUsage && (
                        <li className="text-sm">
                            要約時：
                            {
                                summarizeSpeechCost
                                    ? (<>{costFormatter.format(summarizeSpeechCost.totalUSD)} USD（試算）、入力 {tokensFormatter.format(summarizeSpeechUsage.input[summarizeSpeechCost.price.unit])} {summarizeSpeechCost.unitDisplayName}、出力 {tokensFormatter.format(summarizeSpeechUsage.output[summarizeSpeechCost.price.unit])} {summarizeSpeechCost.unitDisplayName}</>)
                                    : (<>入力 {tokensFormatter.format(summarizeSpeechUsage.input.tokens)} トークン、出力 {tokensFormatter.format(summarizeSpeechUsage.output.tokens)} トークン</>)
                            }
                            {summarizeSpeechResult?.data.chat_model_info && `、モデル：${summarizeSpeechResult.data.chat_model_info.name}`}
                        </li>
                    )}
                </ul>
            </div>
                        }
                    </div>
                </div>

            </div>
        );
    }
}
