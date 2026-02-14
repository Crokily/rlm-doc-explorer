const rawApiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
const normalizedApiBase = rawApiBase
  ? rawApiBase.replace(/\/+$/, "")
  : null;

const API_BASE =
  normalizedApiBase ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000");

export interface DocumentInfo {
  id: string;
  filename: string;
  text_length: number;
  preview?: string;
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object") {
      if ("detail" in payload && typeof payload.detail === "string") {
        return payload.detail;
      }
      if ("error" in payload && typeof payload.error === "string") {
        return payload.error;
      }
      if ("message" in payload && typeof payload.message === "string") {
        return payload.message;
      }
    }
  } catch {
    // Fall through to status text fallback.
  }

  return `${response.status} ${response.statusText}`.trim();
}

export async function uploadDocument(file: File): Promise<DocumentInfo> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${await parseError(response)}`);
  }

  return (await response.json()) as DocumentInfo;
}

export async function listDocuments(): Promise<DocumentInfo[]> {
  const response = await fetch(`${API_BASE}/api/documents`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${await parseError(response)}`);
  }

  return (await response.json()) as DocumentInfo[];
}

export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/documents/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete document: ${await parseError(response)}`);
  }
}
