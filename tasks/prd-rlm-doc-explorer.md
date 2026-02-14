# PRD: RLM Document Explorer

## Introduction

RLM Document Explorer is a web-based demo application that showcases DSPy's Recursive Language Model (RLM) module for document question-answering. Users upload documents (PDF, DOCX, TXT), ask questions about them, and watch in real-time as the RLM iteratively explores the document through code execution, sub-LLM calls, and programmatic reasoning.

The application is inspired by Raymond Weitekamp's (raw.works) research achieving Top-5 results on the LongMemEval benchmark using `dspy.RLM`, demonstrating that RLMs can serve as powerful memory/retrieval systems without pre-processing.

## Goals

1. **Demonstrate RLM power**: Show how dspy.RLM programmatically explores long documents rather than feeding them directly to an LLM
2. **Transparency**: Real-time sidebar showing every RLM iteration — reasoning, code, output
3. **Metrics**: Display token usage, response time, iteration count, recursion depth, sub-LLM call count
4. **Multi-format support**: Handle PDF, DOCX, and TXT document uploads gracefully
5. **Production-quality UX**: Clean, responsive UI with loading states and error handling

## User Stories

### US-001: Project scaffolding and dependency setup
As a developer, I need the project structure (Python backend + Next.js frontend) and all dependencies installed so that downstream stories can build on a working foundation.

**Acceptance Criteria:**
- Python virtual environment with dspy, fastapi, uvicorn, python-multipart, pypdf, python-docx, websockets
- Next.js app in `frontend/` directory on port 4321
- FastAPI app in `backend/` directory on port 8000
- Backend has a `/health` endpoint returning `{"status": "ok"}`
- Frontend has a basic page that displays "RLM Document Explorer"
- `.env` file with GOOGLE_API_KEY configured for Gemini
- Both servers start successfully

### US-002: Document upload and text extraction API
As a user, I want to upload PDF, DOCX, or TXT files and have them parsed to plain text so the RLM can process them.

**Acceptance Criteria:**
- POST `/api/upload` accepts multipart file upload
- Extracts text from PDF (pypdf), DOCX (python-docx), and TXT files
- Returns `{"id": "<uuid>", "filename": "<name>", "text_length": <int>, "preview": "<first 500 chars>"}`
- Stores extracted text in an in-memory dict keyed by document ID
- Returns 400 for unsupported file types
- Returns 400 for empty/unreadable files
- GET `/api/documents` lists all uploaded documents (id, filename, text_length)

### US-003: DSPy.RLM core query pipeline
As a developer, I need the core DSPy.RLM pipeline that takes a document's text and a question, returns an answer with full trajectory metadata.

**Acceptance Criteria:**
- `DocumentQA` Signature with `context`, `question` → `answer` fields
- RLM module configured with Gemini 3 Flash via dspy.LM
- Query function returns: answer, trajectory (list of iteration dicts), total tokens, elapsed time, iteration count, sub-LLM call count
- Trajectory includes for each iteration: reasoning, code, output
- Token counting via dspy's built-in tracking
- Handles errors gracefully (timeout, max iterations)

### US-004: WebSocket streaming endpoint
As a user, I want to see RLM iterations in real-time as they happen, not just the final result.

**Acceptance Criteria:**
- WebSocket endpoint at `/ws/query`
- Client sends `{"document_id": "<id>", "question": "<text>"}`
- Server streams events: `{"type": "iteration", "data": {"iteration": N, "reasoning": "...", "code": "...", "output": "..."}}`
- Final event: `{"type": "result", "data": {"answer": "...", "metrics": {...}}}`
- Error event: `{"type": "error", "data": {"message": "..."}}`
- Handles document not found gracefully
- Uses a custom verbose callback to capture iterations in real-time

### US-005: Frontend document upload UI
As a user, I want a clean upload interface to add my documents.

**Acceptance Criteria:**
- Drag-and-drop zone + file picker button
- Shows accepted formats: PDF, DOCX, TXT
- Upload progress indicator
- After upload: shows document card with filename, text length, preview
- Multiple documents supported, shown as a list/grid
- Delete button to remove a document
- Error toast for unsupported formats

### US-006: Frontend query interface and answer display
As a user, I want to type questions and see answers about my uploaded documents.

**Acceptance Criteria:**
- Document selector dropdown (from uploaded documents)
- Question input with submit button
- Answer displayed in a formatted card below
- Loading state while RLM is processing (spinner + "RLM is exploring your document...")
- Query history list showing previous Q&A pairs
- Disable submit while a query is in progress

### US-007: RLM process sidebar with real-time iterations
As a user, I want to watch the RLM's thinking process in a sidebar panel.

**Acceptance Criteria:**
- Right sidebar panel (collapsible)
- Each iteration shown as an expandable card: iteration number, reasoning (markdown), code (syntax highlighted), output
- New iterations appear with smooth animation as they stream in via WebSocket
- Auto-scroll to latest iteration
- "Idle" state when no query is running
- Color coding: reasoning=blue, code=gray, output=green, error=red

### US-008: Metrics statistics panel
As a user, I want to see performance metrics for each query.

**Acceptance Criteria:**
- Metrics bar/card below the answer area
- Displays: Total tokens used, Response time (seconds), Number of iterations, Recursion depth, Number of sub-LLM calls
- Metrics update when a new query completes
- Visually distinct (icons + labels + values)
- Tooltip explaining what each metric means

### US-009: End-to-end integration, error handling, and UI polish
As a developer, I need the full application working end-to-end with proper error handling and responsive design.

**Acceptance Criteria:**
- Full flow works: upload → select → ask → see iterations → get answer + metrics
- Network error handling (backend down, upload failure, WebSocket disconnect)
- Responsive layout (works on desktop, degrades gracefully on tablet)
- Loading skeletons for initial state
- Proper CORS configuration between frontend (4321) and backend (8000)
- README with setup and run instructions
- Start scripts: `start-backend.sh` and `start-frontend.sh`

## Non-Goals

- User authentication / multi-tenancy
- Persistent storage (all in-memory, lost on restart)
- Image/figure extraction from documents
- RLM optimization via GEPA or other DSPy optimizers
- Depth > 1 recursive subcalls (keeping depth=1 as rawwerks showed this is effective)
- Production deployment configuration

## Technical Considerations

- **DSPy.RLM** is the core engine — uses `dspy.RLM` with `PythonInterpreter` (default Deno/Pyodide sandbox)
- **Gemini 3 Flash** as the LLM backend (configured via `dspy.LM("gemini/gemini-3-flash")`)
- **WebSocket** for real-time streaming of RLM iterations
- **Token tracking**: Use `dspy.settings.lm` history or litellm callback for token counting
- **Document size**: No explicit limit, but RLM handles long contexts by design
- **Concurrency**: Single-user demo; queries are sequential

## Success Metrics

- Upload and query a 10-page PDF successfully
- RLM iterations visible in sidebar in real-time
- Correct answers for factual questions about uploaded documents
- All metrics display correctly after each query
- Application starts with a single command per service
