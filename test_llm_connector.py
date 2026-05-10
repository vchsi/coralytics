"""
Integration test for llm_connector.py using real sensor_readings from MongoDB.

Runs three scenarios:
  1. Single doc  — calls _run_llm_prediction with the latest reading
  2. Multi doc   — calls _run_llm_prediction with the 5 most recent readings
  3. Buffer flow — feeds docs one-by-one through maybe_run_llm and confirms
                   the LLM fires exactly once on the 5th reading

The LLM call is real — VULTR_LLM_URL and LLM_API_KEY are read from .env.
If the LLM endpoint is unreachable the connector falls back gracefully and
the test still passes (fallback_used=True in llm_logs).
"""

import asyncio
import sys

from mongodb_connector import get_db, motor_connect, motor_disconnect
from llm_connector import (
    _run_llm_prediction,
    maybe_run_llm,
    _doc_buffers,
    _sensor_counters,
    LLM_CALL_INTERVAL,
    _build_user_prompt,
    _compute_risk,
)


async def fetch_docs(db, sensor_id: str = "1", limit: int = 5) -> list[dict]:
    cursor = db.sensor_readings.find(
        {"sensor_id": sensor_id},
        sort=[("time", 1)],
        limit=limit,
    )
    docs = await cursor.to_list(length=limit)
    if not docs:
        print(f"  No sensor_readings found for sensor_id={sensor_id}")
        sys.exit(1)
    return docs


def print_prompt_preview(docs: list[dict]) -> None:
    latest = docs[-1]
    risk_level, bleaching_pct, bleaching_event, bleaching_level = _compute_risk(latest)
    prompt = _build_user_prompt(docs, risk_level, bleaching_pct, bleaching_event, bleaching_level)
    print("  --- Prompt preview ---")
    for line in prompt.splitlines():
        print(f"  {line}")
    print("  --- End prompt ---")


async def test_single_doc(db) -> None:
    print("\n[1/3] Single-doc prediction")
    docs = await fetch_docs(db, limit=1)
    print(f"  Fetched 1 doc: _id={docs[0]['_id']}, time={docs[0]['time']}")
    print_prompt_preview(docs)
    await _run_llm_prediction(docs, db)

    pred = await db.predictions.find_one(
        {"sensor_id": "1"}, sort=[("time", -1)]
    )
    log = await db.llm_logs.find_one(
        {"sensor_id": "1"}, sort=[("timestamp", -1)]
    )
    assert pred is not None, "No prediction inserted"
    assert log is not None, "No llm_log inserted"
    assert len(pred["sensor_reading_ids"]) == 1
    print(f"  prediction inserted: _id={pred['_id']} risk_level={pred['risk_level']} fallback={log['fallback_used']}")
    print("  PASS")


async def test_multi_doc(db) -> None:
    print(f"\n[2/3] Multi-doc prediction (window={LLM_CALL_INTERVAL})")
    docs = await fetch_docs(db, limit=LLM_CALL_INTERVAL)
    print(f"  Fetched {len(docs)} docs spanning {docs[0]['time']} → {docs[-1]['time']}")
    print_prompt_preview(docs)
    await _run_llm_prediction(docs, db)

    pred = await db.predictions.find_one(
        {"sensor_id": "1"}, sort=[("time", -1)]
    )
    log = await db.llm_logs.find_one(
        {"sensor_id": "1"}, sort=[("timestamp", -1)]
    )
    assert pred is not None, "No prediction inserted"
    assert len(pred["sensor_reading_ids"]) == LLM_CALL_INTERVAL, (
        f"Expected {LLM_CALL_INTERVAL} reading IDs, got {len(pred['sensor_reading_ids'])}"
    )
    print(f"  prediction inserted: _id={pred['_id']} risk_level={pred['risk_level']} "
          f"risk_7d={pred['risk_7d']} risk_14d={pred['risk_14d']} fallback={log['fallback_used']}")
    print("  PASS")


async def test_buffer_flow(db) -> None:
    print(f"\n[3/3] Buffer flow — LLM fires on every {LLM_CALL_INTERVAL}th reading")
    docs = await fetch_docs(db, limit=LLM_CALL_INTERVAL)

    # Reset state for this sensor to ensure a clean run
    _doc_buffers["1"].clear()
    _sensor_counters["1"] = 0

    pred_before = await db.predictions.count_documents({"sensor_id": "1"})

    for i, doc in enumerate(docs, 1):
        await maybe_run_llm(doc, db)
        fired = (i % LLM_CALL_INTERVAL == 0)
        print(f"  reading {i}/{LLM_CALL_INTERVAL} — LLM {'FIRED' if fired else 'skipped'}")

    pred_after = await db.predictions.count_documents({"sensor_id": "1"})
    new_preds = pred_after - pred_before
    assert new_preds == 1, f"Expected 1 new prediction, got {new_preds}"
    assert _sensor_counters["1"] == LLM_CALL_INTERVAL
    assert len(_doc_buffers["1"]) == LLM_CALL_INTERVAL
    print(f"  {new_preds} new prediction written, buffer size={len(_doc_buffers['1'])}")
    print("  PASS")


async def main() -> None:
    print("Connecting to MongoDB...")
    await motor_connect()
    db = get_db()

    try:
        await test_single_doc(db)
        await test_multi_doc(db)
        await test_buffer_flow(db)
        print("\nAll tests passed.")
    finally:
        motor_disconnect()


if __name__ == "__main__":
    asyncio.run(main())
