import io
import uuid
from pathlib import Path

import docx
import pypdf
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rlm_pipeline import query_document

# Load environment variables from the project root (.env one level above /backend).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = FastAPI(title="RLM Document Explorer API")
documents: dict[str, dict] = {}  # Global dict: id -> {id, filename, text, text_length, preview}
SUPPORTED_EXTENSIONS: set[str] = {".pdf", ".docx", ".doc", ".txt"}


class QueryRequest(BaseModel):
    document_id: str
    question: str

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4321"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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

    document = documents.get(request.document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        return query_document(str(document.get("text", "")), request.question)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Query failed: {exc}") from exc
