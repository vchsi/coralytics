"""
Terminal chatbot — wraps the full RAG pipeline.

Shows:
  - Vector search hits (text_repr + score) retrieved for each query
  - Full LLM answer streamed token by token

Usage:
    python chat_terminal.py [sensor_id]      (default sensor_id = "1")
"""

from __future__ import annotations

import asyncio
import sys

from dotenv import load_dotenv
load_dotenv()

SENSOR_ID = sys.argv[1] if len(sys.argv) > 1 else "1"
DIVIDER = "─" * 60


def _print_header():
    print(f"\n{'═' * 60}")
    print(f"  Coral Reef RAG Chat  |  sensor_id={SENSOR_ID}")
    print(f"{'═' * 60}")
    print("  Type your question and press Enter.")
    print("  Commands: 'quit' / 'exit' to stop, 'clear' to reset history.")
    print(f"{'═' * 60}\n")


async def _show_vector_hits(sensor_id: str, query: str):
    """Run similarity search directly and print retrieved docs."""
    from mongodb_connector import get_sync_collection
    from langchain_community.vectorstores import MongoDBAtlasVectorSearch
    from langchain_core.embeddings import Embeddings
    from embeddings import get_embedder

    class STEmbeddings(Embeddings):
        def embed_documents(self, texts):
            return get_embedder().encode(texts, convert_to_numpy=True).tolist()
        def embed_query(self, text):
            return get_embedder().encode([text], convert_to_numpy=True)[0].tolist()

    loop = asyncio.get_event_loop()
    vectorstore = MongoDBAtlasVectorSearch(
        collection=get_sync_collection("sensor_embeddings"),
        embedding=STEmbeddings(),
        index_name="sensor_embeddings_vector_index",
        text_key="text_repr",
        embedding_key="embedding",
    )

    hits = await loop.run_in_executor(
        None,
        lambda: vectorstore.similarity_search_with_score(
            query, k=4, pre_filter={"sensor_id": {"$eq": sensor_id}}
        ),
    )

    print(f"\n{DIVIDER}")
    print(f"  Vector Search — {len(hits)} hit(s) for sensor {sensor_id}")
    print(DIVIDER)
    for i, (doc, score) in enumerate(hits, 1):
        print(f"  [{i}] score={score:.4f}")
        print(f"      {doc.page_content}")
    print(DIVIDER)


async def _answer(sensor_id: str, message: str, history: list[dict]) -> str:
    """Run the full RAG chain and stream the answer to stdout."""
    from rag import build_system_prompt, build_rag_chain, detect_forecast_intent
    from mongodb_connector import get_db

    db = get_db()
    include_forecast = detect_forecast_intent(message)
    system_prompt = await build_system_prompt(sensor_id, db, include_forecast)

    if include_forecast:
        print("  [forecast context included]")

    chain = build_rag_chain(sensor_id, system_prompt)

    loop = asyncio.get_event_loop()
    answer = await loop.run_in_executor(None, lambda: chain.invoke(message))
    return answer


async def main():
    from mongodb_connector import motor_connect, get_db

    print("Connecting to MongoDB...")
    await motor_connect()
    db = get_db()

    pred_count = await db.predictions.count_documents({})
    emb_count  = await db.sensor_embeddings.count_documents({})
    print(f"  predictions={pred_count}  sensor_embeddings={emb_count}")

    _print_header()

    history: list[dict] = []

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye.")
            break

        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit"):
            print("Goodbye.")
            break
        if user_input.lower() == "clear":
            history.clear()
            print("  [history cleared]\n")
            continue

        # Show vector search results
        await _show_vector_hits(SENSOR_ID, user_input)

        # Stream LLM answer
        print(f"\n  Assistant:\n")
        try:
            answer = await _answer(SENSOR_ID, user_input, history)
            print(f"  {answer}\n")
            history.append({"role": "user",      "content": user_input})
            history.append({"role": "assistant", "content": answer})
        except Exception as e:
            print(f"  [Error: {e}]\n")


if __name__ == "__main__":
    asyncio.run(main())
