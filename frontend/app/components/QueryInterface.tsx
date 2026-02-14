"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRlmQueryContext } from "../hooks/useRlmQuery";
import MetricsPanel from "./MetricsPanel";

interface QueryInterfaceProps {
  documentId: string | null;
}

interface QueryHistoryItem {
  id: number;
  question: string;
  answer: string;
}

export default function QueryInterface({ documentId }: QueryInterfaceProps) {
  const { submitQuery, isLoading, iterations, result, error, resetQuery } =
    useRlmQueryContext();

  const [question, setQuestion] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);

  const historyIdRef = useRef(0);
  const previousDocumentIdRef = useRef<string | null>(documentId);

  const isSubmitDisabled =
    !documentId || question.trim().length === 0 || isLoading;

  useEffect(() => {
    if (previousDocumentIdRef.current === documentId) {
      return;
    }

    previousDocumentIdRef.current = documentId;
    resetQuery();
    setQuestion("");
    setCurrentQuestion(null);
    setHistory([]);
  }, [documentId, resetQuery]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!documentId || trimmedQuestion.length === 0 || isLoading) {
      return;
    }

    if (currentQuestion && result) {
      historyIdRef.current += 1;
      setHistory((current) => [
        {
          id: historyIdRef.current,
          question: currentQuestion,
          answer: result.answer,
        },
        ...current,
      ]);
    }

    resetQuery();
    setCurrentQuestion(trimmedQuestion);
    submitQuery(documentId, trimmedQuestion);
    setQuestion("");
  };

  return (
    <section className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4 shadow-[0_24px_80px_-50px_rgba(0,0,0,0.8)]"
      >
        <label
          htmlFor="question-input"
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500"
        >
          Ask a question
        </label>

        <div className="flex flex-col gap-3 sm:flex-row">
          <textarea
            id="question-input"
            rows={2}
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
            placeholder="What would you like to know about this document?"
            className="min-h-20 flex-1 rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/25"
          />

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="h-10 shrink-0 rounded-xl bg-cyan-500 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            Submit
          </button>
        </div>

        {!documentId && (
          <p className="mt-2 text-xs text-zinc-500">
            Select a document to enable querying.
          </p>
        )}
      </form>

      {isLoading && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-cyan-400" />
            <span>RLM is exploring your document...</span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {iterations.length > 0
              ? `${iterations.length} iteration${iterations.length === 1 ? "" : "s"} streamed`
              : "Waiting for first iteration..."}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {result && currentQuestion && (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Answer
          </p>
          <p className="mt-3 text-sm font-medium text-zinc-200">
            Question: {currentQuestion}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-100">
            {result.answer}
          </p>
        </article>
      )}

      <MetricsPanel />

      {history.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            History
          </p>
          <div className="space-y-3">
            {history.map((entry) => (
              <article
                key={entry.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Question
                </p>
                <p className="mt-2 text-sm text-zinc-200">{entry.question}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Answer
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                  {entry.answer}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {!isLoading && !error && !result && history.length === 0 && (
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/30 text-sm text-zinc-500">
          Ask a question to begin exploring your selected document.
        </div>
      )}
    </section>
  );
}
