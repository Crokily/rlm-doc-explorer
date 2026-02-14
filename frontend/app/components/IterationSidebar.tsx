"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Code2, ScrollText } from "lucide-react";
import { RlmQueryContext } from "../hooks/useRlmQuery";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export default function IterationSidebar() {
  const context = useContext(RlmQueryContext);

  if (!context) {
    throw new Error(
      "IterationSidebar must be used inside RlmQueryContext.Provider.",
    );
  }

  const { iterations, isLoading, statusMessage } = context;

  const [isOpen, setIsOpen] = useState(false);
  const [expandedIterations, setExpandedIterations] = useState<
    Record<number, boolean>
  >({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(0);

  const latestIteration = useMemo(() => {
    if (iterations.length === 0) {
      return null;
    }

    return iterations[iterations.length - 1].iteration;
  }, [iterations]);

  useEffect(() => {
    if (iterations.length > 0) {
      setIsOpen(true);
      return;
    }

    if (!isLoading) {
      setIsOpen(false);
    }
  }, [iterations.length, isLoading]);

  useEffect(() => {
    if (iterations.length === 0) {
      setExpandedIterations({});
      previousCountRef.current = 0;
      return;
    }

    if (iterations.length > previousCountRef.current) {
      const nextExpanded: Record<number, boolean> = {};
      const latest = iterations[iterations.length - 1].iteration;

      for (const item of iterations) {
        nextExpanded[item.iteration] = item.iteration === latest;
      }

      setExpandedIterations(nextExpanded);
    }

    previousCountRef.current = iterations.length;
  }, [iterations]);

  useEffect(() => {
    if (iterations.length === 0 || !isOpen) {
      return;
    }

    const container = scrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [iterations.length, isOpen]);

  const toggleIteration = (iterationId: number) => {
    setExpandedIterations((current) => ({
      ...current,
      [iterationId]: !current[iterationId],
    }));
  };

  return (
    <aside
      className={cx(
        "w-full min-h-[280px] border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-lg transition-all duration-300 min-[1200px]:min-h-[calc(100vh-81px)] min-[1200px]:border-t-0 min-[1200px]:border-l",
        isOpen ? "min-[1200px]:w-[400px]" : "min-[1200px]:w-16",
      )}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              {isOpen ? "RLM Process" : "Process"}
            </p>
            {isOpen && (
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
                {iterations.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Collapse process sidebar" : "Expand process sidebar"}
            className="rounded-lg border border-zinc-700 bg-zinc-900/90 p-1.5 text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
              className={cx(
                "h-4 w-4 transition-transform duration-200",
                isOpen ? "rotate-0" : "rotate-180",
              )}
            >
              <path
                d="M7 5L12 10L7 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </header>

        {isOpen && (
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {statusMessage.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/65 px-3 py-2 text-xs text-zinc-400">
                {statusMessage}
              </div>
            )}

            {isLoading && iterations.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-cyan-400" />
                  <span>Connecting to RLM...</span>
                </div>
              </div>
            )}

            {!isLoading && iterations.length === 0 && (
              <div className="flex min-h-28 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-5 text-sm text-zinc-500">
                No active process
              </div>
            )}

            {iterations.map((iteration, index) => {
              const isLatest = latestIteration === iteration.iteration;
              const hasError = iteration.output.includes("[Error]");
              const isExpanded =
                expandedIterations[iteration.iteration] ?? isLatest;

              return (
                <article
                  key={`${iteration.iteration}-${index}`}
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50"
                >
                  <button
                    type="button"
                    onClick={() => toggleIteration(iteration.iteration)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-zinc-800/45"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cx(
                          "h-2.5 w-2.5 rounded-full",
                          hasError
                            ? "bg-rose-400"
                            : isLatest && isLoading
                              ? "animate-pulse bg-amber-300"
                              : "bg-emerald-400",
                        )}
                      />
                      <span className="text-sm font-medium text-zinc-100">
                        Iteration {iteration.iteration}
                      </span>
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden
                      className={cx(
                        "h-4 w-4 text-zinc-500 transition-transform duration-200",
                        isExpanded ? "rotate-90" : "rotate-0",
                      )}
                    >
                      <path
                        d="M7 5L12 10L7 15"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="space-y-3 border-t border-zinc-800 bg-zinc-950/65 p-3">
                      <section className="rounded-lg border border-sky-400/35 bg-sky-500/10">
                        <div className="flex items-center gap-1.5 border-b border-sky-300/30 bg-sky-400/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">
                          <Brain aria-hidden className="h-3.5 w-3.5" />
                          <span>Reasoning</span>
                        </div>
                        <p className="whitespace-pre-wrap px-3 py-2 text-sm leading-6 text-zinc-100">
                          {iteration.reasoning || "No reasoning captured for this step."}
                        </p>
                      </section>

                      <section className="rounded-lg border border-zinc-700 bg-zinc-900">
                        <div className="flex items-center gap-1.5 border-b border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200">
                          <Code2 aria-hidden className="h-3.5 w-3.5" />
                          <span>Code</span>
                        </div>
                        <pre className="max-h-64 overflow-auto px-3 py-2 font-mono text-sm leading-6 text-zinc-100">
                          {iteration.code || "// No code generated in this iteration."}
                        </pre>
                      </section>

                      <section
                        className={cx(
                          "rounded-lg border",
                          hasError
                            ? "border-rose-400/40 bg-rose-500/10"
                            : "border-emerald-400/35 bg-emerald-500/10",
                        )}
                      >
                        <div
                          className={cx(
                            "flex items-center gap-1.5 border-b px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]",
                            hasError
                              ? "border-rose-400/35 bg-rose-500/15 text-rose-200"
                              : "border-emerald-300/30 bg-emerald-400/15 text-emerald-200",
                          )}
                        >
                          <ScrollText aria-hidden className="h-3.5 w-3.5" />
                          <span>Output</span>
                        </div>
                        <pre
                          className={cx(
                            "max-h-64 overflow-auto whitespace-pre-wrap px-3 py-2 text-sm leading-6",
                            hasError ? "text-rose-100" : "text-emerald-100",
                          )}
                        >
                          {iteration.output || "No output captured for this step."}
                        </pre>
                      </section>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
