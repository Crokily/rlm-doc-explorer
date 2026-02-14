# RLM Document Explorer

A web demo showcasing DSPy's Recursive Language Model (RLM) for document question-answering.
Upload documents (PDF, DOCX, TXT), ask questions, and watch the RLM iteratively explore your documents through code execution and sub-LLM calls.

## Architecture

- **Backend**: Python FastAPI + DSPy RLM (port 8000)
- **Frontend**: Next.js + Tailwind CSS (port 4321)
- **LLM**: Google Gemini 3 Flash Preview (`gemini-3-flash-preview`) via DSPy (with fallback models)

## Quick Start

### 1. Install Deno (required for RLM code execution)

```bash
curl -fsSL https://deno.land/install.sh | sh
export PATH="$HOME/.deno/bin:$PATH"
# optional if deno is in a custom location:
# export DENO_BIN=/absolute/path/to/deno
```

### 2. Set up environment

```bash
# Clone and enter the project
cd rlm-doc-explorer

# Create .env with your Google API key
cat > .env <<'ENV'
GOOGLE_API_KEY=your-key-here
# Optional override (defaults to gemini-3-flash-preview)
# GEMINI_MODEL=gemini-3-flash-preview
ENV
```

### 3. Start the backend

```bash
./start-backend.sh
```

### 4. Start the frontend (in another terminal)

```bash
./start-frontend.sh
```

### 5. Open the app

Navigate to http://localhost:4321

## Features

- **Document Upload**: Drag-and-drop PDF, DOCX, or TXT files
- **RLM Query**: Ask questions about your documents
- **Process Visualization**: Watch RLM iterations in real-time (reasoning, code, output)
- **Metrics**: Token usage, response time, iterations, depth, sub-LLM calls

## How It Works

RLM (Recursive Language Models) treats long documents as an external environment.
Instead of feeding the entire document to the LLM, the model writes Python code to
programmatically explore, search, and analyze the document content. It can call
sub-LLMs (via `llm_query()`) for semantic understanding of specific passages.

This approach allows processing documents far beyond typical context window limits
and produces more accurate results than naive long-context approaches.

## Tech Stack

- [DSPy](https://github.com/stanfordnlp/dspy) - Framework for programming with LLMs
- [dspy.RLM](https://github.com/stanfordnlp/dspy/blob/main/dspy/predict/rlm.py) - Recursive Language Model module
- [FastAPI](https://fastapi.tiangolo.com/) - Python web framework
- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
