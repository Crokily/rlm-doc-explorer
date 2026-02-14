import json
import logging
import os
import shutil
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import dspy

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_MODEL_FALLBACKS = (
    "gemini-2.5-flash",
    "gemini-flash-latest",
)
GOOGLE_LIST_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"
_resolved_model_name: str | None = None


class DocumentQA(dspy.Signature):
    """Answer questions about a document by recursively exploring its content.
    Use the REPL to programmatically search, analyze, and extract information."""

    context: str = dspy.InputField(desc="The full document text to explore")
    question: str = dspy.InputField(desc="The user's question about the document")
    answer: str = dspy.OutputField(
        desc="A detailed, accurate answer based on the document content"
    )


def _normalize_model_name(model_name: str) -> str:
    normalized = model_name.strip()
    if not normalized:
        return ""
    if normalized.startswith("gemini/"):
        return normalized
    if normalized.startswith("models/"):
        normalized = normalized[len("models/") :]
    return f"gemini/{normalized}"


def _list_generate_content_models(api_key: str) -> set[str]:
    query = urlencode({"key": api_key})
    with urlopen(f"{GOOGLE_LIST_MODELS_URL}?{query}", timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))

    models: set[str] = set()
    for model in payload.get("models", []) or []:
        if not isinstance(model, dict):
            continue

        methods = model.get("supportedGenerationMethods", []) or []
        if "generateContent" not in methods:
            continue

        name = model.get("name", "")
        if isinstance(name, str) and name.startswith("models/"):
            name = name[len("models/") :]

        if isinstance(name, str) and name:
            models.add(name)

    return models


def _resolve_gemini_model(api_key: str) -> str:
    global _resolved_model_name
    if _resolved_model_name:
        return _resolved_model_name

    configured = _normalize_model_name(
        os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
    )

    candidates: list[str] = []
    for candidate in (
        configured,
        _normalize_model_name(DEFAULT_GEMINI_MODEL),
        *(_normalize_model_name(model) for model in GEMINI_MODEL_FALLBACKS),
    ):
        if candidate and candidate not in candidates:
            candidates.append(candidate)

    try:
        available = _list_generate_content_models(api_key)
    except Exception:
        logger.exception(
            "Failed to list Gemini models via ListModels. Falling back to %s",
            candidates[0],
        )
        _resolved_model_name = candidates[0]
        return _resolved_model_name

    for candidate in candidates:
        candidate_without_provider = candidate.split("/", 1)[1]
        if candidate_without_provider in available:
            _resolved_model_name = candidate
            logger.info("Using Gemini model: %s", _resolved_model_name)
            return _resolved_model_name

    tried = ", ".join(candidates)
    raise ValueError(
        "No compatible Gemini model found for generateContent. "
        f"Tried: {tried}. Set GEMINI_MODEL to an available model name."
    )


def _ensure_deno_available() -> None:
    if shutil.which("deno"):
        return

    candidates: list[Path] = []
    deno_bin_env = os.environ.get("DENO_BIN", "").strip()
    if deno_bin_env:
        candidates.append(Path(deno_bin_env).expanduser())

    candidates.append(Path.home() / ".deno" / "bin" / "deno")

    for candidate in candidates:
        if candidate.is_file():
            os.environ["PATH"] = f"{candidate.parent}:{os.environ.get('PATH', '')}"
            if shutil.which("deno"):
                logger.info("Using Deno binary at %s", candidate)
                return

    raise RuntimeError(
        "Deno executable not found. Install Deno and ensure it is on PATH, "
        "or set DENO_BIN to the absolute deno path."
    )


def configure_dspy():
    """Configure DSPy with a valid Gemini model name."""
    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not set")

    model_name = _resolve_gemini_model(api_key)
    return dspy.LM(model_name, api_key=api_key)


def query_document(doc_text: str, question: str) -> dict:
    """
    Run dspy.RLM to answer a question about a document.

    Returns dict with:
    - answer: str
    - trajectory: list of dicts with {iteration, reasoning, code, output}
    - elapsed_time_s: float
    - iteration_count: int
    - sub_llm_calls: int (estimated from trajectory)
    - total_tokens: int (estimated)
    """
    _ensure_deno_available()
    lm = configure_dspy()

    rlm = dspy.RLM(
        DocumentQA,
        max_iterations=10,
        max_llm_calls=20,
        verbose=True,
    )

    start_time = time.time()

    try:
        # Track LM history length before call to count new calls.
        history_before = len(lm.history) if hasattr(lm, "history") else 0

        with dspy.context(lm=lm):
            result = rlm(context=doc_text, question=question)

        elapsed = time.time() - start_time

        # Parse trajectory from result.
        trajectory = []
        raw_trajectory = getattr(result, "trajectory", []) or []
        for i, entry in enumerate(raw_trajectory):
            if isinstance(entry, dict):
                trajectory.append(
                    {
                        "iteration": i + 1,
                        "reasoning": entry.get("reasoning", ""),
                        "code": entry.get("code", ""),
                        "output": entry.get("output", ""),
                    }
                )

        # Estimate token usage from LM history.
        total_tokens = 0

        # Try to extract token counts from LM history.
        if hasattr(lm, "history"):
            try:
                for entry in lm.history[history_before:]:
                    if isinstance(entry, dict):
                        usage = entry.get("usage", {})
                        if isinstance(usage, dict):
                            total_tokens += usage.get("total_tokens", 0)
                    # DSPy LM history entries might have response attribute.
                    elif hasattr(entry, "response"):
                        resp = entry.response
                        if hasattr(resp, "usage") and resp.usage:
                            total_tokens += getattr(resp.usage, "total_tokens", 0)
            except Exception:
                logger.exception("Failed while extracting token usage from LM history")
                total_tokens = 0

        # Count sub-LLM calls from trajectory (iterations that contain llm_query in code).
        sub_llm_calls = sum(1 for t in trajectory if "llm_query" in t.get("code", ""))

        return {
            "answer": result.answer,
            "trajectory": trajectory,
            "elapsed_time_s": round(elapsed, 2),
            "iteration_count": len(trajectory),
            "sub_llm_calls": sub_llm_calls,
            "total_tokens": total_tokens,
            "depth": 1,  # We use depth=1 (default).
        }

    except Exception as e:
        elapsed = time.time() - start_time
        logger.exception("RLM query failed")
        return {
            "answer": f"Error: {str(e)}",
            "trajectory": [],
            "elapsed_time_s": round(elapsed, 2),
            "iteration_count": 0,
            "sub_llm_calls": 0,
            "total_tokens": 0,
            "depth": 1,
            "error": str(e),
        }
