from __future__ import annotations

import json
import logging
import os
import time as _time
from datetime import datetime

import httpx
from dotenv import load_dotenv

load_dotenv()

from embeddings import embed, prediction_text_repr  # noqa: E402

logger = logging.getLogger(__name__)

VULTR_LLM_URL = os.getenv("VULTR_LLM_URL", "http://localhost:8080/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "testkey")
LLM_WINDOW = 5

FALLBACKS = {
    "low": {
        "risk_description": "Reef conditions appear stable with no significant thermal stress detected.",
        "notices": ["Continue routine monitoring"],
        "next_steps": ["Maintain current observation schedule"],
        "risk_7d": 0.0,
        "risk_14d": 0.0,
    },
    "medium": {
        "risk_description": "Moderate stress indicators present. Thermal accumulation warrants attention.",
        "notices": ["Thermal stress accumulating", "Monitor turbidity"],
        "next_steps": ["Increase monitoring frequency", "Review historical trends"],
        "risk_7d": 35.0,
        "risk_14d": 45.0,
    },
    "high": {
        "risk_description": "Significant bleaching risk detected. Immediate review recommended.",
        "notices": ["High thermal stress", "Bleaching likely"],
        "next_steps": ["Alert reef managers", "Deploy field survey team"],
        "risk_7d": 70.0,
        "risk_14d": 80.0,
    },
    "critical": {
        "risk_description": "Critical bleaching event in progress. Immediate action required.",
        "notices": ["Mass bleaching event", "Critical thermal stress"],
        "next_steps": ["Emergency response", "Contact authorities", "Suspend diving activity"],
        "risk_7d": 95.0,
        "risk_14d": 98.0,
    },
}

SYSTEM_PROMPT = """You are a coral reef health analyst with access to real-time sensor data and historical reef patterns. Given a window of recent sensor readings and pre-calculated bleaching risk metrics, produce a structured health assessment.

Respond ONLY with valid JSON in this exact format:
{
  "risk_description": "...",
  "notices": ["...", "..."],
  "next_steps": ["...", "..."],
  "risk_7d": <float 0-100>,
  "risk_14d": <float 0-100>
}

Fields:
- risk_description: 1-2 sentence summary of current reef health status
- notices: 2-4 specific observations derived  from the trend across all provided readings
- next_steps: 2-4 actionable recommendations ordered by urgency
- risk_7d: predicted bleaching risk % in 7 days (0-100), based on observed SSTA/DHW trend across the reading window and historical reef patterns
- risk_14d: predicted bleaching risk % in 14 days (0-100), incorporating seasonal context, month, and multi-week thermal trajectory

Use the full reading window to identify trends. Do not include any text outside the JSON object."""


def _compute_risk(doc: dict) -> tuple[str, float, bool, int]:
    ssta = doc.get("ssta", 0)
    dhw = doc.get("ssta_dhw", 0)
    if dhw >= 8:
        return "critical", min(100.0, round(60 + dhw * 2.5, 1)), True, 4
    if dhw >= 4:
        return "high", min(100.0, round(30 + dhw * 5, 1)), True, 3
    if dhw >= 1:
        return "medium", min(100.0, round(dhw * 15, 1)), False, 2
    if ssta >= 0.5:
        return "medium", round(ssta * 10, 1), False, 1
    return "low", max(0.0, round(ssta * 5, 1)), False, 0


def _fix_apostrophes(obj):
    if isinstance(obj, str):
        return obj.replace("'", "’")
    if isinstance(obj, list):
        return [_fix_apostrophes(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _fix_apostrophes(v) for k, v in obj.items()}
    return obj


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text[3:]
        if text.startswith("json"):
            text = text[4:]
        end = text.rfind("```")
        if end != -1:
            text = text[:end]
    return text.strip()


def _build_user_prompt(docs: list[dict], risk_level: str, bleaching_pct: float,
                       bleaching_event: bool, bleaching_level: int) -> str:
    latest = docs[-1]
    n = len(docs)

    header = (
        f"Sensor ID: {latest['sensor_id']}\n"
        f"Reading window: {n} reading(s), oldest → newest\n\n"
    )

    table_header = (
        f"{'#':<4} {'Timestamp':<22} {'SST(°C)':<10} {'SSTA':<8} "
        f"{'DHW':<8} {'Turb/10':<9} {'pH':<7} {'Light@d(lux)'}\n"
        + "-" * 82 + "\n"
    )
    rows = ""
    for i, d in enumerate(docs, 1):
        rows += (
            f"{i:<4} {str(d['time']):<22} "
            f"{d['sst_k'] - 273.15:<10.2f} "
            f"{d['ssta']:<8.3f} "
            f"{d['ssta_dhw']:<8.3f} "
            f"{d['turbidity']:<9.1f} "
            f"{d['ph']:<7.2f} "
            f"{d['light_at_depth']:.2f}\n"
        )

    latest_detail = (
        f"\nLatest reading detail:\n"
        f"- Sea surface temp: {latest['sst_k']} K ({latest['sst_k'] - 273.15:.2f} °C)\n"
        f"- Subsurface temp:  {latest['temperature_k']} K ({latest['temperature_k'] - 273.15:.2f} °C)\n"
        f"- SSTA:             {latest['ssta']}\n"
        f"- SSTA DHW:         {latest['ssta_dhw']} degree heating weeks\n"
        f"- Turbidity:        {latest['turbidity']:.1f} / 10\n"
        f"- pH:               {latest['ph']}\n"
        f"- Surface light:    {latest['surface_light']} lux\n"
        f"- Light at depth:   {latest['light_at_depth']:.2f} lux\n"
        f"- Salinity:         {latest.get('salinity', 33.5)} ppt\n"
        f"- Month/Year:       {latest['month']}/{latest['year']}\n"
    )

    risk_detail = (
        f"\nPre-calculated risk values (from latest reading):\n"
        f"- risk_level:    {risk_level}\n"
        f"- bleaching_pct: {bleaching_pct}\n"
        f"- bleaching_event: {bleaching_event}\n"
        f"- bleaching_level: {bleaching_level}\n\n"
        f"Respond with JSON only."
    )

    return header + table_header + rows + latest_detail + risk_detail


async def run_llm_prediction(docs: list[dict], db) -> None:
    if not docs:
        return
    latest = docs[-1]
    try:
        risk_level, bleaching_pct, bleaching_event, bleaching_level = _compute_risk(latest)
        user_prompt = _build_user_prompt(docs, risk_level, bleaching_pct, bleaching_event, bleaching_level)

        logger.info(">>> LLM polling sensor_id=%s | window=%d | risk=%s (%.1f%%)",
                    latest["sensor_id"], len(docs), risk_level, bleaching_pct)
        print(f">>> LLM polling sensor_id={latest['sensor_id']} | window={len(docs)} | risk={risk_level} ({bleaching_pct}%)", flush=True)

        t0 = _time.monotonic()
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{VULTR_LLM_URL}/chat/completions",
                headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                json={
                    "model": "local-model",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 512,
                    "temperature": 0.3,
                },
            )
            response.raise_for_status()
        latency_ms = int((_time.monotonic() - t0) * 1000)

        raw_llm_output = response.json()["choices"][0]["message"]["content"]

        try:
            parsed = json.loads(_strip_fences(raw_llm_output))
            parsed = _fix_apostrophes(parsed)
            parse_success = True
        except (json.JSONDecodeError, ValueError):
            parsed = FALLBACKS[risk_level]
            parse_success = False

        fallback = FALLBACKS[risk_level]
        risk_description = parsed.get("risk_description", fallback["risk_description"])
        notices = parsed.get("notices", fallback["notices"])
        next_steps = parsed.get("next_steps", fallback["next_steps"])
        risk_7d = parsed.get("risk_7d", fallback["risk_7d"])
        risk_14d = parsed.get("risk_14d", fallback["risk_14d"])

        await db.llm_logs.insert_one({
            "timestamp": datetime.utcnow(),
            "mode": "prediction",
            "sensor_id": latest["sensor_id"],
            "prompt_summary": f"n={len(docs)}, ssta={latest['ssta']}, dhw={latest['ssta_dhw']}, risk={risk_level}",
            "raw_output": raw_llm_output,
            "parse_success": parse_success,
            "confidence": 1.0 if parse_success else 0.0,
            "fallback_used": not parse_success,
            "latency_ms": latency_ms,
        })

        pred_doc = {
            "time": latest["time"],
            "sensor_id": latest["sensor_id"],
            "sensor_reading_ids": [d["_id"] for d in docs],
            "bleaching_pct": bleaching_pct,
            "bleaching_level": bleaching_level,
            "bleaching_event": bleaching_event,
            "risk_level": risk_level,
            "risk_description": risk_description,
            "notices": notices,
            "next_steps": next_steps,
            "risk_7d": risk_7d,
            "risk_14d": risk_14d,
            "alert_sent": False,
            "alert_type": None,
        }
        text_repr = prediction_text_repr(pred_doc)
        import asyncio as _asyncio
        loop = _asyncio.get_event_loop()
        embedding = await loop.run_in_executor(None, embed, text_repr)
        pred_doc["text_repr"] = text_repr
        pred_doc["embedding"] = embedding
        result = await db.predictions.insert_one(pred_doc)
        print(json.dumps({
            "_id": str(result.inserted_id),
            "time": latest["time"].isoformat(),
            "sensor_id": latest["sensor_id"],
            "sensor_reading_ids": [str(d["_id"]) for d in docs],
            "bleaching_pct": bleaching_pct,
            "bleaching_level": bleaching_level,
            "bleaching_event": bleaching_event,
            "risk_level": risk_level,
            "risk_description": risk_description,
            "notices": notices,
            "next_steps": next_steps,
            "risk_7d": risk_7d,
            "risk_14d": risk_14d,
            "alert_sent": False,
            "alert_type": None,
            "_meta": {"latency_ms": latency_ms, "fallback_used": not parse_success},
        }, indent=2), flush=True)

    except Exception:
        logger.exception("LLM prediction failed for sensor_id=%s", latest.get("sensor_id"))
