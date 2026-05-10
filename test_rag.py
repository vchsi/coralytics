"""
Integration tests for rag.py — hits real MongoDB and real Vultr LLM.

Tests:
  1. detect_forecast_intent     — keyword matching, no DB needed
  2. classify_risk               — threshold boundaries, no DB needed
  3. get_forecast_context        — reads predictions from DB
  4. build_system_prompt         — reads sensors + predictions from DB
  5. full chat (non-forecast)    — end-to-end SSE stream via event_stream
  6. full chat (forecast intent) — same but message triggers forecast block
  7. multi-turn history          — second question references first answer
"""

import asyncio
import sys

from mongodb_connector import motor_connect, motor_disconnect, get_db
from rag import (
    detect_forecast_intent,
    classify_risk,
    get_forecast_context,
    build_system_prompt,
    event_stream,
)

SENSOR_ID = "1"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _collect_sse(chunks: list[str]) -> str:
    """Join SSE token chunks into a single answer string."""
    import json as _json
    tokens = []
    for chunk in chunks:
        if chunk.strip() == "data: [DONE]":
            break
        if chunk.startswith("data: "):
            try:
                payload = _json.loads(chunk[6:])
                if "token" in payload:
                    tokens.append(payload["token"])
                elif "error" in payload:
                    return f"[ERROR] {payload['error']}"
            except _json.JSONDecodeError:
                pass
    return "".join(tokens)


async def _stream(sensor_id: str, message: str, history: list = None) -> str:
    db = get_db()
    chunks = []
    async for chunk in event_stream(sensor_id, message, history or [], db):
        chunks.append(chunk)
    return _collect_sse(chunks)


# ---------------------------------------------------------------------------
# 1. detect_forecast_intent
# ---------------------------------------------------------------------------

def test_forecast_intent_detection():
    print("\n[1/7] detect_forecast_intent")

    positives = [
        "What is the forecast for next week?",
        "Show me the 7d risk trend",
        "Give me a 14 day outlook",
        "What's the bleaching prediction?",
        "Where is this heading in the future?",
        "Risk trajectory for sensor 1",
    ]
    negatives = [
        "What is the current pH?",
        "How is the reef doing right now?",
        "Explain degree heating weeks",
        "Is the water clear?",
    ]

    for msg in positives:
        result = detect_forecast_intent(msg)
        assert result, f"Expected True for: {msg!r}"
        print(f"  ✓ forecast  | {msg!r}")

    for msg in negatives:
        result = detect_forecast_intent(msg)
        assert not result, f"Expected False for: {msg!r}"
        print(f"  ✓ non-fcst  | {msg!r}")

    print("  PASS")


# ---------------------------------------------------------------------------
# 2. classify_risk
# ---------------------------------------------------------------------------

def test_classify_risk():
    print("\n[2/7] classify_risk")

    cases = [
        (0.0,   "low"),
        (19.9,  "low"),
        (20.0,  "medium"),
        (49.9,  "medium"),
        (50.0,  "high"),
        (79.9,  "high"),
        (80.0,  "critical"),
        (100.0, "critical"),
    ]
    for pct, expected in cases:
        got = classify_risk(pct)
        assert got == expected, f"classify_risk({pct}) = {got!r}, want {expected!r}"
        print(f"  ✓ {pct:5.1f}% → {got}")
    print("  PASS")


# ---------------------------------------------------------------------------
# 3. get_forecast_context (DB read)
# ---------------------------------------------------------------------------

async def test_forecast_context():
    print(f"\n[3/7] get_forecast_context (sensor_id={SENSOR_ID})")
    db = get_db()
    context = await get_forecast_context(SENSOR_ID, db)
    print(f"  context length: {len(context)} chars")
    for line in context.splitlines():
        print(f"  {line}")
    assert len(context) > 10, "Context should not be empty"
    print("  PASS")


# ---------------------------------------------------------------------------
# 4. build_system_prompt (DB read)
# ---------------------------------------------------------------------------

async def test_build_system_prompt():
    print(f"\n[4/7] build_system_prompt (sensor_id={SENSOR_ID})")
    db = get_db()

    prompt_no_forecast = await build_system_prompt(SENSOR_ID, db, include_forecast=False)
    assert "coral reef" in prompt_no_forecast.lower(), "Missing reef context"
    assert "Sensor" in prompt_no_forecast, "Missing sensor info"
    assert "trajectory" not in prompt_no_forecast, "Should not include forecast block"
    print(f"  no-forecast prompt ({len(prompt_no_forecast)} chars) — OK")

    prompt_with_forecast = await build_system_prompt(SENSOR_ID, db, include_forecast=True)
    assert "trajectory" in prompt_with_forecast.lower() or "risk" in prompt_with_forecast.lower(), \
        "Forecast block should mention risk/trajectory"
    assert len(prompt_with_forecast) > len(prompt_no_forecast), \
        "Forecast prompt should be longer than no-forecast prompt"
    print(f"  with-forecast prompt ({len(prompt_with_forecast)} chars) — OK")
    print("  PASS")


# ---------------------------------------------------------------------------
# 5. Full chat — general question
# ---------------------------------------------------------------------------

async def test_chat_general():
    print(f"\n[5/7] Full RAG chat — general question (sensor_id={SENSOR_ID})")
    msg = "What is the current reef health status for this sensor?"
    print(f"  Q: {msg!r}")
    answer = await _stream(SENSOR_ID, msg)
    print(f"  A ({len(answer)} chars): {answer[:200]}{'...' if len(answer) > 200 else ''}")
    assert len(answer) > 10, f"Expected a real answer, got: {answer!r}"
    assert not answer.startswith("[ERROR]"), f"Got error: {answer}"
    print("  PASS")


# ---------------------------------------------------------------------------
# 6. Full chat — forecast question
# ---------------------------------------------------------------------------

async def test_chat_forecast():
    print(f"\n[6/7] Full RAG chat — forecast question (sensor_id={SENSOR_ID})")
    msg = "What is the 7-day bleaching risk forecast and trend?"
    print(f"  Q: {msg!r}")
    assert detect_forecast_intent(msg), "Message should trigger forecast intent"
    answer = await _stream(SENSOR_ID, msg)
    print(f"  A ({len(answer)} chars): {answer[:200]}{'...' if len(answer) > 200 else ''}")
    assert len(answer) > 10, f"Expected a real answer, got: {answer!r}"
    assert not answer.startswith("[ERROR]"), f"Got error: {answer}"
    print("  PASS")


# ---------------------------------------------------------------------------
# 7. Multi-turn history
# ---------------------------------------------------------------------------

async def test_chat_multiturn():
    print(f"\n[7/7] Multi-turn conversation (sensor_id={SENSOR_ID})")
    db = get_db()

    q1 = "What is degree heating weeks (DHW)?"
    print(f"  Turn 1 Q: {q1!r}")
    a1 = await _stream(SENSOR_ID, q1)
    print(f"  Turn 1 A ({len(a1)} chars): {a1[:150]}...")
    assert len(a1) > 10 and not a1.startswith("[ERROR]"), f"Turn 1 failed: {a1!r}"

    history = [{"role": "user", "content": q1}, {"role": "assistant", "content": a1}]
    q2 = "Given that, what does the current DHW reading mean for this reef?"
    print(f"  Turn 2 Q: {q2!r}")
    a2 = await _stream(SENSOR_ID, q2, history=history)
    print(f"  Turn 2 A ({len(a2)} chars): {a2[:150]}...")
    assert len(a2) > 10 and not a2.startswith("[ERROR]"), f"Turn 2 failed: {a2!r}"
    print("  PASS")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

async def main():
    print("Connecting to MongoDB...")
    await motor_connect()

    pred_count = await get_db().predictions.count_documents({})
    emb_count  = await get_db().sensor_embeddings.count_documents({})
    print(f"  predictions: {pred_count}  sensor_embeddings: {emb_count}")
    if pred_count == 0 or emb_count == 0:
        print("WARNING: collections are empty — RAG retrieval will have no context to pull from")

    try:
        # Unit tests (no DB, no LLM)
        test_forecast_intent_detection()
        test_classify_risk()

        # DB reads only
        await test_forecast_context()
        await test_build_system_prompt()

        # Full LLM calls
        await test_chat_general()
        await test_chat_forecast()
        await test_chat_multiturn()

        print("\nAll tests passed.")
    finally:
        motor_disconnect()


if __name__ == "__main__":
    asyncio.run(main())
