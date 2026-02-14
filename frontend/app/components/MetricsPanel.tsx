"use client";

import { useContext, useEffect, useState } from "react";
import { RlmQueryContext } from "../hooks/useRlmQuery";

interface MetricDisplay {
  icon: string;
  label: string;
  value: number | string;
  tooltip: string;
}

export default function MetricsPanel() {
  const queryContext = useContext(RlmQueryContext);
  const result = queryContext?.result ?? null;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!result) {
      setIsVisible(false);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [result]);

  if (!result) {
    return null;
  }

  const metrics: MetricDisplay[] = [
    {
      icon: "🔤",
      label: "Tokens",
      value: result.metrics.tokens.toLocaleString(),
      tooltip: "Total tokens consumed by the LLM during this query",
    },
    {
      icon: "⏱️",
      label: "Time",
      value: `${result.metrics.time_s.toFixed(1)}s`,
      tooltip: "Total wall-clock time for the RLM execution",
    },
    {
      icon: "🔄",
      label: "Iterations",
      value: result.metrics.iterations,
      tooltip: "Number of REPL iterations the RLM performed",
    },
    {
      icon: "📊",
      label: "Depth",
      value: result.metrics.depth,
      tooltip: "Recursion depth (1 = no recursive sub-calls)",
    },
    {
      icon: "🤖",
      label: "Sub-LLM Calls",
      value: result.metrics.sub_llm_calls,
      tooltip: "Number of llm_query() calls made within the REPL",
    },
  ];

  return (
    <section
      className={`rounded-2xl border border-zinc-700/50 bg-zinc-900 p-4 transition-all duration-300 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      }`}
      aria-label="RLM query metrics"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Query Metrics
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            title={metric.tooltip}
            className="min-w-[130px] flex-1 rounded-xl border border-zinc-700/50 bg-zinc-800/40 px-3 py-2"
          >
            <p className="text-xs font-medium text-zinc-400">
              <span role="img" aria-label={metric.label}>
                {metric.icon}
              </span>{" "}
              {metric.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">
              {metric.value}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
