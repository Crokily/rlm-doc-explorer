"use client";

import { useState } from "react";
import DocumentUpload from "./components/DocumentUpload";
import IterationSidebar from "./components/IterationSidebar";
import QueryInterface from "./components/QueryInterface";
import { RlmQueryContext, useRlmQuery } from "./hooks/useRlmQuery";

export default function Home() {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const rlmQuery = useRlmQuery();

  const normalizedDocId =
    selectedDocId && selectedDocId.length > 0 ? selectedDocId : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-2xl font-bold">RLM Document Explorer</h1>
        <p className="text-sm text-zinc-400">
          Powered by DSPy Recursive Language Models
        </p>
      </header>

      <RlmQueryContext.Provider value={rlmQuery}>
        <div className="flex min-h-[calc(100vh-81px)] flex-col min-[1200px]:flex-row">
          <aside className="w-full min-h-[320px] border-b border-zinc-800 p-4 min-[1200px]:min-h-[calc(100vh-81px)] min-[1200px]:w-96 min-[1200px]:shrink-0 min-[1200px]:border-b-0 min-[1200px]:border-r">
            <DocumentUpload onDocumentSelect={setSelectedDocId} />
          </aside>

          <main className="flex-1 min-h-[420px] p-6 min-[1200px]:min-h-[calc(100vh-81px)]">
            <QueryInterface documentId={normalizedDocId} />
          </main>

          <IterationSidebar />
        </div>
      </RlmQueryContext.Provider>
    </div>
  );
}
