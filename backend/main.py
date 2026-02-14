import io
import os
import uuid
from pathlib import Path

import docx
import pypdf
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rlm_pipeline import query_document
from ws_handler import handle_query_ws

app = FastAPI(title="RLM Document Explorer API")
documents: dict[str, dict] = {}  # Global dict: id -> {id, filename, text, text_length, preview}
SUPPORTED_EXTENSIONS: set[str] = {".pdf", ".docx", ".doc", ".txt"}
PROVIDER_MODELS: dict[str, dict] = {
    "gemini": {
        "label": "Google Gemini",
        "api_key_name": "Google API Key",
        "models": [
            {"id": "gemini/gemini-3-flash-preview", "name": "Gemini 3 Flash (Preview)"},
            {"id": "gemini/gemini-3-pro-preview", "name": "Gemini 3 Pro (Preview)"},
        ],
        "default": "gemini/gemini-3-flash-preview",
    },
    "openai": {
        "label": "OpenAI",
        "api_key_name": "OpenAI API Key",
        "models": [
            {"id": "gpt-5.2-codex", "name": "GPT-5.2 Codex"},
            {"id": "gpt-5.2", "name": "GPT-5.2"},
            {"id": "gpt-5.1", "name": "GPT-5.1"},
            {"id": "gpt-5.1-codex", "name": "GPT-5.1 Codex"},
            {"id": "gpt-5.1-codex-mini", "name": "GPT-5.1 Codex Mini"},
            {"id": "gpt-5", "name": "GPT-5"},
            {"id": "gpt-5-mini", "name": "GPT-5 Mini"},
            {"id": "gpt-5-nano", "name": "GPT-5 Nano"},
        ],
        "default": "gpt-5.2-codex",
    },
    "anthropic": {
        "label": "Anthropic",
        "api_key_name": "Anthropic API Key",
        "models": [
            {"id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5"},
            {"id": "claude-opus-4-6", "name": "Claude Opus 4.6"},
            {"id": "claude-haiku-4-5", "name": "Claude Haiku 4.5"},
        ],
        "default": "claude-sonnet-4-5",
    },
}


class QueryRequest(BaseModel):
    document_id: str
    question: str
    api_key: str
    model: str


def get_allowed_origins() -> list[str]:
    configured = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]

    return [
        "http://localhost:4321",
        "http://127.0.0.1:4321",
        "https://rlm.a2a.ing",
        "https://rlm-doc-explorer-frontend.vercel.app",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_origin_regex=os.environ.get("CORS_ALLOWED_ORIGIN_REGEX", r"https://.*\.vercel\.app"),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/providers")
def list_providers() -> dict[str, dict]:
    return PROVIDER_MODELS


def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Failed to parse PDF file.") from exc


def extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        document = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(paragraph.text for paragraph in document.paragraphs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Failed to parse DOCX/DOC file.") from exc


def extract_text_from_txt(file_bytes: bytes) -> str:
    try:
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="TXT files must be UTF-8 encoded.") from exc


def extract_text(filename: str, file_bytes: bytes) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Supported types: .pdf, .docx, .doc, .txt",
        )

    if extension == ".pdf":
        return extract_text_from_pdf(file_bytes)
    if extension in {".docx", ".doc"}:
        return extract_text_from_docx(file_bytes)
    return extract_text_from_txt(file_bytes)


@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)) -> dict[str, str | int]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must include a filename.")

    file_bytes = await file.read()
    extracted_text = extract_text(file.filename, file_bytes)
    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="Extracted text is empty.")

    document_id = str(uuid.uuid4())
    preview = extracted_text[:500]
    document_record: dict[str, str | int] = {
        "id": document_id,
        "filename": file.filename,
        "text": extracted_text,
        "text_length": len(extracted_text),
        "preview": preview,
    }
    documents[document_id] = document_record

    return {
        "id": document_id,
        "filename": file.filename,
        "text_length": len(extracted_text),
        "preview": preview,
    }


@app.get("/api/documents")
def list_documents() -> list[dict[str, str | int]]:
    return [
        {
            "id": document["id"],
            "filename": document["filename"],
            "text_length": document["text_length"],
        }
        for document in documents.values()
    ]


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str) -> dict[str, str]:
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found.")

    del documents[doc_id]
    return {"status": "deleted"}


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str) -> dict[str, str | int]:
    document = documents.get(doc_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    return {
        "id": document["id"],
        "filename": document["filename"],
        "text_length": document["text_length"],
        "preview": document["preview"],
    }


@app.post("/api/query")
def query_document_endpoint(request: QueryRequest) -> dict:
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if not request.api_key.strip():
        raise HTTPException(
            status_code=400,
            detail="API key is required. Please configure your API key in Settings.",
        )
    if not request.model.strip():
        raise HTTPException(
            status_code=400,
            detail="Model is required. Please select a model in Settings.",
        )

    document = documents.get(request.document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        return query_document(
            str(document.get("text", "")),
            request.question,
            request.model,
            request.api_key,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Query failed: {exc}") from exc


@app.websocket("/ws/query")
async def ws_query(websocket: WebSocket) -> None:
    await handle_query_ws(websocket, documents)
