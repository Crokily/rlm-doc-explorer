"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  deleteDocument,
  listDocuments,
  type DocumentInfo,
  uploadDocument,
} from "../lib/api";
import { FileText, Loader2, Trash2 } from "lucide-react";

interface DocumentUploadProps {
  onDocumentSelect: (docId: string) => void;
}

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt"];
const ACCEPTED_TYPES = ACCEPTED_EXTENSIONS.join(",");
const BACKEND_OFFLINE_MESSAGE =
  "Backend is not running. Start the backend on port 8000.";

function isSupportedFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed")
  );
}

function getPreviewLine(preview?: string): string {
  if (!preview) {
    return "No preview available yet.";
  }

  const [firstLine] = preview.split(/\r?\n/, 1);
  const trimmed = firstLine?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "No preview available yet.";
}

export default function DocumentUpload({ onDocumentSelect }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedDocRef = useRef<string | null>(null);

  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);

  const selectDocument = useCallback(
    (docId: string | null) => {
      selectedDocRef.current = docId;
      setSelectedDocId(docId);
      onDocumentSelect(docId ?? "");
    },
    [onDocumentSelect],
  );

  const refreshDocuments = useCallback(
    async (previewOverrides?: Record<string, string>) => {
      setIsLoadingDocuments(true);
      try {
        const docs = await listDocuments();

        setDocuments((currentDocs) => {
          const previewMap = new Map<string, string>();
          for (const doc of currentDocs) {
            if (doc.preview) {
              previewMap.set(doc.id, doc.preview);
            }
          }
          if (previewOverrides) {
            for (const [docId, preview] of Object.entries(previewOverrides)) {
              previewMap.set(docId, preview);
            }
          }

          return docs.map((doc) =>
            previewMap.has(doc.id)
              ? { ...doc, preview: previewMap.get(doc.id) }
              : doc,
          );
        });

        const currentlySelected = selectedDocRef.current;
        if (currentlySelected && !docs.some((doc) => doc.id === currentlySelected)) {
          if (docs.length > 0) {
            selectDocument(docs[0].id);
          } else {
            selectDocument(null);
          }
        }
      } catch (err) {
        setError(
          isNetworkFailure(err)
            ? BACKEND_OFFLINE_MESSAGE
            : err instanceof Error
              ? err.message
              : "Unable to load documents right now.",
        );
      } finally {
        setIsLoadingDocuments(false);
      }
    },
    [selectDocument],
  );

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  useEffect(() => {
    if (!error) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setError(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [error]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!isSupportedFile(file)) {
        setError("Unsupported file type. Please upload PDF, DOCX, DOC, or TXT.");
        return;
      }

      setIsUploading(true);
      try {
        const uploadedDoc = await uploadDocument(file);
        const previewOverrides = uploadedDoc.preview
          ? { [uploadedDoc.id]: uploadedDoc.preview }
          : undefined;

        await refreshDocuments(previewOverrides);
        selectDocument(uploadedDoc.id);
      } catch (err) {
        setError(
          isNetworkFailure(err)
            ? BACKEND_OFFLINE_MESSAGE
            : err instanceof Error
              ? err.message
              : "Upload failed.",
        );
      } finally {
        setIsUploading(false);
      }
    },
    [refreshDocuments, selectDocument],
  );

  const handleBrowseClick = () => {
    if (!isUploading) {
      inputRef.current?.click();
    }
  };

  const handleInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleUpload(file);
      event.target.value = "";
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    if (isUploading) {
      return;
    }

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      await handleUpload(droppedFile);
    }
  };

  const handleDropZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleBrowseClick();
    }
  };

  const handleDelete = async (
    event: MouseEvent<HTMLButtonElement>,
    docId: string,
  ) => {
    event.stopPropagation();
    setDeletingDocId(docId);
    try {
      await deleteDocument(docId);
      await refreshDocuments();
    } catch (err) {
      setError(
        isNetworkFailure(err)
          ? BACKEND_OFFLINE_MESSAGE
          : err instanceof Error
            ? err.message
            : "Delete failed.",
      );
    } finally {
      setDeletingDocId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={handleBrowseClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleDropZoneKeyDown}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragOver
            ? "border-blue-500 bg-blue-500/10"
            : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-500 hover:bg-zinc-900"
        } ${isUploading ? "pointer-events-none opacity-80" : ""}`}
        aria-label="Upload a document"
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_TYPES}
          onChange={(event) => {
            void handleInputChange(event);
          }}
        />
        <div className="space-y-3">
          <div className="flex justify-center" aria-hidden>
            <FileText className="h-8 w-8 text-zinc-300" />
          </div>
          {isUploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-200">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-300" />
              <span>Uploading document...</span>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-100 sm:text-base">
                Drop PDF, DOCX, or TXT files here
              </p>
              <p className="text-xs text-zinc-400">or click to browse</p>
            </>
          )}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
            Uploaded Documents
          </h2>
          {isLoadingDocuments ? (
            <span className="text-xs text-zinc-500">Refreshing...</span>
          ) : null}
        </div>

        {documents.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-500">
            No documents uploaded yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    selectDocument(doc.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectDocument(doc.id);
                    }
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    selectedDocId === doc.id
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-zinc-800 bg-zinc-900/70 hover:border-zinc-700"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {doc.filename}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {numberFormatter.format(doc.text_length)} chars
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        void handleDelete(event, doc.id);
                      }}
                      disabled={deletingDocId === doc.id}
                      className="inline-flex items-center justify-center rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition-colors hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete ${doc.filename}`}
                    >
                      {deletingDocId === doc.id ? (
                        <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 aria-hidden className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="truncate text-xs text-zinc-400">
                    {getPreviewLine(doc.preview)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
