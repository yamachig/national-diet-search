/* eslint-disable no-irregular-whitespace */
"use client";

import React from "react";
import createClient from "openapi-fetch";
import type { paths } from "../serverSchema";
import { useAuth } from "../lib/auth";

interface State {
  question: string | null,
  searchSpeechesResult: paths["/search_speeches"]["get"]["responses"][200]["content"]["application/json"] | null,
  selectedSpeechID: string | null,
  summarizeSpeechResult: {
    data: paths["/summarize_speech"]["get"]["responses"][200]["content"]["application/json"],
    id: string,
  } | null,
}

const client = createClient<paths>({ baseUrl: `${process.env.NEXT_PUBLIC_API_HOST ?? ""}/` });

export default function Home() {
    const { authSettings, authStatus, signIn } = useAuth(client);

    const loginButtonOnClick: React.MouseEventHandler<HTMLButtonElement> = React.useCallback(() => {
        signIn();
    }, [signIn]);

    const [
        {
            question,
            searchSpeechesResult,
            selectedSpeechID,
            summarizeSpeechResult,
        }, setState,
    ] = React.useState<State>({
        question: null,
        searchSpeechesResult: null,
        selectedSpeechID: null,
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
            selectedSpeechID: null,
            summarizeSpeechResult: null,
        }));
    }, []);

    React.useEffect(() => {
        if (question === null) return;
        (async () => {
            if (!authSettings || (authSettings.type !== "none" && !authStatus)) return;
            const token = await authStatus?.currentUser?.getIdToken();
            const response = await client.GET(
                "/search_speeches",
                {
                    params: {
                        query: { question },
                        ...(token
                            ? { header: { authorization: `Bearer ${token}` } }
                            : {}
                        ),
                    },
                },
            );
            if (!response.data) return;

            const data = response.data;
            setState(origState => ({
                ...origState,
                searchSpeechesResult: data,
                selectedSpeechID: data.speeches[0]?.speechID ?? null,
                summarizeSpeechResult: null,
            }));

        })();
    }, [authSettings, authStatus, question]);

    React.useEffect(() => {
        if (selectedSpeechID === null || searchSpeechesResult === null || selectedSpeechID === (summarizeSpeechResult?.id ?? null)) return;
        const speech = searchSpeechesResult.speeches.find((s) => s.speechID === selectedSpeechID);
        if (!speech || !question) return;

        (async () => {
            if (!authSettings || (authSettings.type !== "none" && !authStatus)) return;
            const token = await authStatus?.currentUser?.getIdToken();
            const response = await client.GET(
                "/summarize_speech",
                {
                    params: {
                        query: { question, speech: speech.speech },
                        ...(token
                            ? { header: { authorization: `Bearer ${token}` } }
                            : {}
                        ),
                    },
                },
            );
            if (!response.data) return;

            const data = response.data;
            setState(origState => ({
                ...origState,
                summarizeSpeechResult: { data, id: selectedSpeechID },
            }));
        })();
    }, [authSettings, authStatus, question, searchSpeechesResult, selectedSpeechID, summarizeSpeechResult?.id]);

    const searchSpeechesCost = React.useMemo(() => {
        if (!searchSpeechesResult) return null;
        const inTokens = Object.values(searchSpeechesResult.usage).map((u) => u.in_tokens as number).reduce((a, b) => a + b, 0);
        const outTokens = Object.values(searchSpeechesResult.usage).map((u) => u.out_tokens as number).reduce((a, b) => a + b, 0);
        const inUSD = (searchSpeechesResult.chat_model_info.price !== null) ? (searchSpeechesResult.chat_model_info.price.unit_usd_in * inTokens) : null;
        const outUSD = (searchSpeechesResult.chat_model_info.price !== null) ? (searchSpeechesResult.chat_model_info.price.unit_usd_out * outTokens) : null;
        const totalUSD = (inUSD !== null && outUSD !== null) ? (inUSD + outUSD) : null;
        return {
            inTokens,
            outTokens,
            inUSD,
            outUSD,
            totalUSD,
        };
    }, [searchSpeechesResult]);

    const summarizeSpeechCost = React.useMemo(() => {
        if (!summarizeSpeechResult) return null;
        const inTokens = Object.values(summarizeSpeechResult.data.usage).map((u) => u.in_tokens as number).reduce((a, b) => a + b, 0);
        const outTokens = Object.values(summarizeSpeechResult.data.usage).map((u) => u.out_tokens as number).reduce((a, b) => a + b, 0);
        const inUSD = (summarizeSpeechResult.data.chat_model_info.price !== null) ? (summarizeSpeechResult.data.chat_model_info.price.unit_usd_in * inTokens) : null;
        const outUSD = (summarizeSpeechResult.data.chat_model_info.price !== null) ? (summarizeSpeechResult.data.chat_model_info.price.unit_usd_out * outTokens) : null;
        const totalUSD = (inUSD !== null && outUSD !== null) ? (inUSD + outUSD) : null;
        return {
            inTokens,
            outTokens,
            inUSD,
            outUSD,
            totalUSD,
        };
    }, [summarizeSpeechResult]);

    const costFormatter = React.useMemo(() => new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 6, minimumFractionDigits: 6 }), []);

    const tokensFormatter = React.useMemo(() => new Intl.NumberFormat("ja-JP", { useGrouping: true }), []);

    if (!authSettings || (authSettings.type !== "none" && !authStatus)) {
        return <span>Loading...</span>;
    } else if (authSettings.type !== "none" && !authStatus?.currentUser) {
        return (<button className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700" onClick={loginButtonOnClick}>Log in</button>);
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
                        {(question !== null && !searchSpeechesResult) && <div className="animate-pulse">
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
                        {searchSpeechesResult && searchSpeechesResult.speeches.map((speech, key) => (
                            <div className={`mb-4 rounded p-4 ${speech.speechID === selectedSpeechID ? "bg-zinc-100" : "hover:bg-zinc-50"}`} key={key} onClick={() => { if (speech.speechID !== selectedSpeechID) setState(s => ({ ...s, selectedSpeechID: speech.speechID, summarizeSpeechResult: null })); }}>
                                <div className="mb-2 text-sm">
                                    <span className="mr-1 rounded bg-zinc-200 p-1 text-xs">{speech.score}%</span><a href={`https://kokkai.ndl.go.jp/#/detail?minId=${speech.issueID}&spkNum=${speech.speechOrder}`} target="_blank" className="text-sky-700 hover:underline" rel="noreferrer">{speech.date}／{speech.nameOfHouse} {speech.nameOfMeeting}／{speech.speaker} {speech.speakerPosition}</a>
                                </div>
                                {(speech.speechID === selectedSpeechID && summarizeSpeechResult) ? (
                                    <pre className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: summarizeSpeechResult.data.annotated.replace("\n", "<br/>") }}></pre>
                                ) : (
                                    <pre className="whitespace-pre-wrap text-sm">{speech.speech}</pre>
                                )}
                                <div className="mb-2 text-right text-sm">
                検索キーワード：{speech.queries.map((q: string) => <span className="mr-1 rounded bg-white p-1 text-xs">{q}</span>)}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex basis-1/2 flex-col">
                        <div className="h-1/2 grow overflow-y-auto px-4">
                            {(selectedSpeechID !== null && !summarizeSpeechResult) && <div className="animate-pulse">
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
                            {summarizeSpeechResult && <>
                                <ul className="text-xl">
                                    {summarizeSpeechResult.data.summary.split(/(?<=。)/).map((sentence, key) => <li className="mb-4 pl-4 -indent-4" key={key}>○　{sentence}</li>)}
                                </ul>
                            </>}
                        </div>
                        {(searchSpeechesResult || summarizeSpeechResult) &&
            <div className="grow-0 bg-zinc-100 p-4">
                <ul>
                    {searchSpeechesResult && <>
                        <li className="text-sm">検索キーワード：{searchSpeechesResult.queries.map((q: string) => <span className="mr-1 inline-block rounded bg-white p-1 text-xs">{q}</span>)}</li>
                    </>}
                    {searchSpeechesCost && <>
                        <li className="text-sm">検索時：{searchSpeechesCost.totalUSD !== null && <>{costFormatter.format(searchSpeechesCost.totalUSD)} USD（試算）、</>}入力 {tokensFormatter.format(searchSpeechesCost.inTokens)} トークン、出力 {tokensFormatter.format(searchSpeechesCost.outTokens)} トークン{searchSpeechesResult && `、モデル：${searchSpeechesResult.chat_model_info.name}`}</li>
                    </>}
                    {summarizeSpeechCost && <>
                        <li className="text-sm">要約時：{summarizeSpeechCost.totalUSD !== null && <>{costFormatter.format(summarizeSpeechCost.totalUSD)} USD（試算）、</>}入力 {tokensFormatter.format(summarizeSpeechCost.inTokens)} トークン、出力 {tokensFormatter.format(summarizeSpeechCost.outTokens)} トークン{summarizeSpeechResult && `、モデル：${summarizeSpeechResult.data.chat_model_info.name}`}</li>
                    </>}
                </ul>
            </div>
                        }
                    </div>
                </div>

            </div>
        );
    }
}
