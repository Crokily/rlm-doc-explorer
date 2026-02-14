"use client";

import { useState } from "react";
import DocumentUpload from "./components/DocumentUpload";

export default function Home() {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-2xl font-bold">RLM Document Explorer</h1>
        <p className="text-sm text-zinc-400">
          Powered by DSPy Recursive Language Models
        </p>
      </header>

      <div className="flex min-h-[calc(100vh-81px)] flex-col lg:flex-row">
        <aside className="w-full border-b border-zinc-800 p-4 lg:min-h-[calc(100vh-81px)] lg:w-96 lg:border-b-0 lg:border-r">
          <DocumentUpload onDocumentSelect={setSelectedDocId} />
        </aside>

        <main className="flex-1 p-6">
          {selectedDocId ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <p className="text-zinc-300">
                Document selected. Query interface coming soon...
              </p>
            </div>
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/30 text-zinc-500">
              <p>Upload and select a document to get started</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
