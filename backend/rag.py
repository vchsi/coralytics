from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

logger = logging.getLogger(__name__)

RAG_K = int(os.getenv("RAG_K", "20"))

# ---------------------------------------------------------------------------
# Lazy imports — heavy ML packages loaded on first use
# ---------------------------------------------------------------------------
_embedder = None
_langchain_ready = False


def _get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedder


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    sensor_id: str
    message: str
    history: list[dict] = []


# ---------------------------------------------------------------------------
# SSE callback handler
# ---------------------------------------------------------------------------

class SSECallbackHandler:
    def __init__(self, queue: asyncio.Queue):
        self._queue = queue

    async def on_llm_new_token(self, token: str) -> None:
        await self._queue.put(token)

    async def on_llm_end(self) -> None:
        await self._queue.put(None)  # sentinel

    async def on_llm_error(self, error: Exception) -> None:
        await self._queue.put(None)


# ---------------------------------------------------------------------------
# Intent detection
# ---------------------------------------------------------------------------

_FORECAST_KEYWORDS = {
    "forecast", "predict", "prediction", "future", "trajectory",
    "trend", "7 day", "14 day", "7d", "14d", "next week", "two week",
    "outlook", "projection", "risk next",
}


def detect_forecast_intent(message: str) -> bool:
    lower = message.lower()
    return any(kw in lower for kw in _FORECAST_KEYWORDS)


# ---------------------------------------------------------------------------
# Risk classifier helper
# ---------------------------------------------------------------------------

def classify_risk(pct: float) -> str:
    if pct >= 80:
        return "critical"
    if pct >= 50:
        return "high"
    if pct >= 20:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Forecast context builder
# ---------------------------------------------------------------------------

async def get_forecast_context(sensor_id: str, db) -> str:
    docs = await db.predictions.find(
        {"sensor_id": sensor_id},
        sort=[("time", -1)],
        limit=4,
    ).to_list(length=4)

    if not docs:
        return "No forecast data available for this sensor."

    docs.reverse()  # oldest → newest

    lines = ["Recent risk trajectory (oldest → newest):"]
    for doc in docs:
        ts = doc.get("time", "?")
        bleaching_pct = doc.get("bleaching_pct", 0.0)
        risk_7d = doc.get("risk_7d", 0.0)
        risk_14d = doc.get("risk_14d", 0.0)
        level = classify_risk(bleaching_pct)
        lines.append(
            f"  [{ts}] current={bleaching_pct:.1f}% ({level}) "
            f"| 7d={risk_7d:.1f}% | 14d={risk_14d:.1f}%"
        )

    latest = docs[-1]
    b7 = latest.get("risk_7d", 0.0)
    b14 = latest.get("risk_14d", 0.0)
    b21 = b14 + (b14 - b7) * 0.5
    b28 = b14 + (b14 - b7) * 1.0
    b21 = min(max(b21, 0.0), 100.0)
    b28 = min(max(b28, 0.0), 100.0)

    lines.append(
        f"\nExtrapolated outlook: "
        f"21d≈{b21:.1f}% ({classify_risk(b21)}), "
        f"28d≈{b28:.1f}% ({classify_risk(b28)})"
    )

    notices = latest.get("notices", [])
    next_steps = latest.get("next_steps", [])
    if notices:
        lines.append("\nLatest notices: " + "; ".join(notices))
    if next_steps:
        lines.append("Recommended actions: " + "; ".join(next_steps))

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# System prompt builder
# ---------------------------------------------------------------------------

async def build_system_prompt(sensor_id: str, db, include_forecast: bool) -> str:
    sensor = await db.sensors.find_one({"sensor_id": sensor_id})
    sensor_info = ""
    if sensor:
        sensor_info = (
            f"Sensor {sensor_id} — location: {sensor.get('location', 'unknown')}, "
            f"depth: {sensor.get('depth', '?')}m, "
            f"climatological SST baseline: {sensor.get('clim_sst', '?')}°C"
        )
    else:
        sensor_info = f"Sensor {sensor_id} (no metadata available)"

    forecast_block = ""
    if include_forecast:
        forecast_block = "\n\n" + await get_forecast_context(sensor_id, db)

    return (
        "You are a coral reef health assistant with expertise in bleaching risk, "
        "thermal stress, and reef ecology. Answer questions about reef sensor data "
        "clearly and concisely. Use the provided context to ground your answers.\n\n"
        f"Sensor context: {sensor_info}"
        f"{forecast_block}"
    )


# ---------------------------------------------------------------------------
# Vectorstore cache — rebuilt once per sensor, reused across requests
# ---------------------------------------------------------------------------

_vectorstore_cache: dict[str, object] = {}


def _get_vectorstore(sensor_id: str):
    if sensor_id not in _vectorstore_cache:
        from langchain_community.vectorstores import MongoDBAtlasVectorSearch
        from langchain_core.embeddings import Embeddings
        from mongodb_connector import get_sync_collection

        class STEmbeddings(Embeddings):
            def embed_documents(self, texts: list[str]) -> list[list[float]]:
                return _get_embedder().encode(texts, convert_to_numpy=True).tolist()
            def embed_query(self, text: str) -> list[float]:
                return _get_embedder().encode([text], convert_to_numpy=True)[0].tolist()

        _vectorstore_cache[sensor_id] = MongoDBAtlasVectorSearch(
            collection=get_sync_collection("sensor_embeddings"),
            embedding=STEmbeddings(),
            index_name="sensor_embeddings_vector_index",
            text_key="text_repr",
            embedding_key="embedding",
        )
    return _vectorstore_cache[sensor_id]


# ---------------------------------------------------------------------------
# RAG chain builder
# ---------------------------------------------------------------------------

def build_rag_chain(sensor_id: str, system_prompt: str):
    from langchain_openai import ChatOpenAI
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
    from langchain_core.output_parsers import StrOutputParser
    from langchain_core.runnables import RunnablePassthrough
    from llm_connector import VULTR_LLM_URL, LLM_API_KEY

    retriever = _get_vectorstore(sensor_id).as_retriever(
        search_kwargs={"k": RAG_K, "pre_filter": {"sensor_id": {"$eq": sensor_id}}}
    )

    llm = ChatOpenAI(
        base_url=f"{VULTR_LLM_URL}/",
        api_key=LLM_API_KEY,
        model="local-model",
        temperature=0.4,
        max_tokens=512,
        streaming=True,
        request_timeout=60,
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt + "\n\nRelevant sensor context:\n{context}"),
        MessagesPlaceholder("history", optional=True),
        ("human", "{question}"),
    ])

    def format_docs(docs):
        return "\n\n".join(d.page_content for d in docs)

    chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough(), "history": lambda _: []}
        | prompt
        | llm
        | StrOutputParser()
    )

    return chain


# ---------------------------------------------------------------------------
# RAG runner (streams via queue)
# ---------------------------------------------------------------------------

_CHAIN_TIMEOUT = float(os.getenv("RAG_CHAIN_TIMEOUT", "90"))


async def run_rag_chain(
    chain,
    message: str,
    history: list[dict],
    queue: asyncio.Queue,
    callback: SSECallbackHandler,
) -> None:
    loop = asyncio.get_event_loop()

    def _stream_tokens():
        """Run in a thread pool — pushes each token into the asyncio queue as it arrives."""
        try:
            for token in chain.stream(message):
                # thread-safe enqueue; put_nowait is safe for unbounded Queue
                loop.call_soon_threadsafe(queue.put_nowait, token)
        except Exception as e:
            logger.exception("RAG chain error: %s", e)
            short = str(e)[:200]
            loop.call_soon_threadsafe(queue.put_nowait, f"\n\n_(LLM error: {short})_")
        finally:
            # sentinel: signals event_stream the generator is done
            loop.call_soon_threadsafe(queue.put_nowait, None)

    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, _stream_tokens),
            timeout=_CHAIN_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.error("RAG chain timed out after %.0fs", _CHAIN_TIMEOUT)
        # Ensure sentinel is delivered even on timeout
        loop.call_soon_threadsafe(queue.put_nowait, None)


# ---------------------------------------------------------------------------
# SSE event stream generator
# ---------------------------------------------------------------------------

async def event_stream(
    sensor_id: str,
    message: str,
    history: list[dict],
    db,
) -> AsyncIterator[str]:
    include_forecast = detect_forecast_intent(message)

    queue: asyncio.Queue = asyncio.Queue()
    callback = SSECallbackHandler(queue)

    try:
        # Build system prompt and warm the vectorstore cache in parallel
        system_prompt, _ = await asyncio.gather(
            build_system_prompt(sensor_id, db, include_forecast),
            asyncio.get_event_loop().run_in_executor(None, _get_vectorstore, sensor_id),
        )
        chain = build_rag_chain(sensor_id, system_prompt)
    except Exception as e:
        logger.exception("Failed to build RAG chain")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return

    task = asyncio.create_task(
        run_rag_chain(chain, message, history, queue, callback)
    )

    got_any = False
    while True:
        try:
            token = await asyncio.wait_for(queue.get(), timeout=_CHAIN_TIMEOUT + 10)
        except asyncio.TimeoutError:
            task.cancel()
            yield "data: [TIMEOUT]\n\n"
            return
        if token is None:
            break
        got_any = True
        yield f"data: {json.dumps({'token': token})}\n\n"

    await task
    if not got_any:
        yield "data: [TIMEOUT]\n\n"
    else:
        yield "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# Public entry point — called from ws.py
# ---------------------------------------------------------------------------

async def chat(request: ChatRequest, app) -> StreamingResponse:
    from mongodb_connector import get_db
    db = get_db()

    async def generate():
        async for chunk in event_stream(
            sensor_id=request.sensor_id,
            message=request.message,
            history=request.history,
            db=db,
        ):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
