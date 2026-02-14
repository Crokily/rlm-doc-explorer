import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from rlm_pipeline import query_document

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=2)


async def handle_query_ws(websocket: WebSocket, documents: dict[str, dict[str, Any]]) -> None:
    """Handle one WebSocket query session with trajectory replay streaming."""
    await websocket.accept()

    try:
        data = await websocket.receive_json()
        document_id = str(data.get("document_id", "")).strip()
        question = str(data.get("question", "")).strip()

        if not document_id or not question:
            await websocket.send_json(
                {
                    "type": "error",
                    "data": {"message": "Both document_id and question are required"},
                }
            )
            return

        document = documents.get(document_id)
        if document is None:
            await websocket.send_json(
                {"type": "error", "data": {"message": "Document not found"}}
            )
            return

        await websocket.send_json(
            {"type": "status", "data": {"message": "RLM is exploring your document..."}}
        )

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            executor,
            query_document,
            str(document.get("text", "")),
            question,
        )

        trajectory = result.get("trajectory", []) or []
        for entry in trajectory:
            await websocket.send_json({"type": "iteration", "data": entry})
            await asyncio.sleep(0.1)

        metrics = {
            "tokens": result.get("total_tokens", 0),
            "time_s": result.get("elapsed_time_s", 0),
            "iterations": result.get("iteration_count", 0),
            "depth": result.get("depth", 1),
            "sub_llm_calls": result.get("sub_llm_calls", 0),
        }

        await websocket.send_json(
            {
                "type": "result",
                "data": {
                    "answer": result.get("answer", ""),
                    "metrics": metrics,
                },
            }
        )
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:
        logger.exception("WebSocket handler error")
        try:
            await websocket.send_json({"type": "error", "data": {"message": str(exc)}})
        except Exception:
            # If the socket is already closed, there is nothing else to do.
            pass
