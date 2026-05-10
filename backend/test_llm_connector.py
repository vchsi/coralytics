"""
Integration test for llm_connector.py using real sensor_readings from MongoDB.

Runs three scenarios:
  1. Single doc  — calls run_llm_prediction with the latest reading
  2. Multi doc   — calls run_llm_prediction with the 5 most recent readings
  3. ws.py flow  — simulates the ws.py counter: feeds 5 readings, confirms the
                   LLM fires exactly once on the 5th and receives the last 5 docs

The LLM call is real — VULTR_LLM_URL and LLM_API_KEY are read from .env.
If the endpoint is unreachable the connector falls back gracefully and the
test still passes (fallback_used=True in llm_logs).
"""

import asyncio
import sys
from collections import defaultdict

from mongodb_connector import get_db, motor_connect, motor_disconnect
from llm_connector import run_llm_prediction, _build_user_prompt, _compute_risk, LLM_WINDOW


async def fetch_docs(db, sensor_id: str = "1", limit: int = 5) -> list[dict]:
    docs = await db.sensor_readings.find(
        {"sensor_id": sensor_id},
        sort=[("time", 1)],
        limit=limit,
    ).to_list(length=limit)
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
    await run_llm_prediction(docs, db)

    pred = await db.predictions.find_one({"sensor_id": "1"}, sort=[("time", -1)])
    log = await db.llm_logs.find_one({"sensor_id": "1"}, sort=[("timestamp", -1)])
    assert pred is not None, "No prediction inserted"
    assert log is not None, "No llm_log inserted"
    assert len(pred["sensor_reading_ids"]) == 1
    print(f"  prediction _id={pred['_id']} risk_level={pred['risk_level']} fallback={log['fallback_used']}")
    print("  PASS")


async def test_multi_doc(db) -> None:
    print(f"\n[2/3] Multi-doc prediction (window={LLM_WINDOW})")
    docs = await fetch_docs(db, limit=LLM_WINDOW)
    print(f"  Fetched {len(docs)} docs: {docs[0]['time']} → {docs[-1]['time']}")
    print_prompt_preview(docs)
    await run_llm_prediction(docs, db)

    pred = await db.predictions.find_one({"sensor_id": "1"}, sort=[("time", -1)])
    log = await db.llm_logs.find_one({"sensor_id": "1"}, sort=[("timestamp", -1)])
    assert pred is not None, "No prediction inserted"
    assert len(pred["sensor_reading_ids"]) == LLM_WINDOW, (
        f"Expected {LLM_WINDOW} reading IDs, got {len(pred['sensor_reading_ids'])}"
    )
    print(f"  prediction _id={pred['_id']} risk_level={pred['risk_level']} "
          f"risk_7d={pred['risk_7d']} risk_14d={pred['risk_14d']} fallback={log['fallback_used']}")
    print("  PASS")


async def test_ws_counter_flow(db) -> None:
    print(f"\n[3/3] ws.py counter flow — LLM fires on 5th reading, receives last {LLM_WINDOW} docs")
    docs = await fetch_docs(db, limit=LLM_WINDOW)

    counts: dict[str, int] = defaultdict(int)
    pred_before = await db.predictions.count_documents({"sensor_id": "1"})

    tasks = []
    for i, doc in enumerate(docs, 1):
        counts["1"] += 1
        fired = counts["1"] % LLM_WINDOW == 0
        print(f"  reading {i}/{LLM_WINDOW} — LLM {'FIRED' if fired else 'skipped'}")
        if fired:
            recent = await db.sensor_readings.find(
                {"sensor_id": "1"},
                sort=[("time", -1)],
                limit=LLM_WINDOW,
            ).to_list(length=LLM_WINDOW)
            recent.reverse()
            assert len(recent) == LLM_WINDOW, f"DB returned {len(recent)} docs, expected {LLM_WINDOW}"
            tasks.append(asyncio.create_task(run_llm_prediction(recent, db)))

    await asyncio.gather(*tasks)

    pred_after = await db.predictions.count_documents({"sensor_id": "1"})
    new_preds = pred_after - pred_before
    assert new_preds == 1, f"Expected 1 new prediction, got {new_preds}"
    print(f"  {new_preds} new prediction written")
    print("  PASS")


async def main() -> None:
    print("Connecting to MongoDB...")
    await motor_connect()
    db = get_db()
    try:
        await test_single_doc(db)
        await test_multi_doc(db)
        await test_ws_counter_flow(db)
        print("\nAll tests passed.")
    finally:
        motor_disconnect()


if __name__ == "__main__":
    asyncio.run(main())
