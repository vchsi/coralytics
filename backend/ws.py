from __future__ import annotations

import asyncio
import json
import logging
import math
import os
from collections import defaultdict
from datetime import datetime, timedelta
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from llm_connector import run_llm_prediction, LLM_WINDOW
from mongodb_connector import get_db, motor_connect, motor_disconnect
from polling import poll_sensor
from rag import chat as rag_chat, ChatRequest
from embeddings import embed, reading_text_repr, get_embedder

_sensor_reading_counts: dict[str, int] = defaultdict(int)
_background_tasks: set = set()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SensorReading(BaseModel):
    id: str
    temperature: float
    ph: float
    turbidity: float
    surface_light: float
    sst: float


class IngestPayload(BaseModel):
    sensor_values: List[SensorReading]

VULTR_LLM_URL = os.getenv("VULTR_LLM_URL", "http://localhost:8080/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "testkey")
TEXTBEE_API_KEY = os.getenv("TEXTBEE_API_KEY")
TEXTBEE_DEVICE_ID = os.getenv("TEXTBEE_DEVICE_ID")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

app = FastAPI(title="Coral Reef Sensor Monitoring API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, sensor_id: str):
        await websocket.accept()
        self.active_connections.setdefault(sensor_id, []).append(websocket)
        logger.info("WebSocket connected for sensor %s", sensor_id)

    def disconnect(self, websocket: WebSocket, sensor_id: str):
        conns = self.active_connections.get(sensor_id, [])
        if websocket in conns:
            conns.remove(websocket)
        logger.info("WebSocket disconnected for sensor %s", sensor_id)

    async def broadcast(self, sensor_id: str, data: dict):
        conns = self.active_connections.get(sensor_id, [])
        dead = []
        for ws in conns:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, sensor_id)

    def is_connected(self, sensor_id: str) -> bool:
        return bool(self.active_connections.get(sensor_id))


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# WebSocket helpers
# ---------------------------------------------------------------------------

_READING_EXCLUDE  = {"salinity", "embedding", "text_repr"}
_PREDICT_EXCLUDE  = {"embedding", "text_repr"}


def serialize_doc(doc: dict, exclude: set = frozenset()) -> dict:
    doc = {k: v for k, v in doc.items() if k not in exclude}
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    if "sensor_reading_id" in doc:
        doc["sensor_reading_id"] = str(doc["sensor_reading_id"])
    for field in ("timestamp", "time"):
        if field in doc and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    if "sensor_reading_ids" in doc:
        doc["sensor_reading_ids"] = [str(i) for i in doc["sensor_reading_ids"]]
    return doc


async def is_sensor_online(db, sensor_id: str) -> bool:
    sensor = await db.sensors.find_one({"sensor_id": sensor_id, "online": True})
    if not sensor:
        return False
    cutoff = datetime.utcnow() - timedelta(seconds=60)
    recent = await db.sensor_readings.find_one(
        {"sensor_id": sensor_id, "time": {"$gte": cutoff}}
    )
    return recent is not None


async def get_sensor_history(db, sensor_id: str, n: int = 25) -> list:
    docs = await db.sensor_readings.find(
        {"sensor_id": sensor_id},
        sort=[("time", -1)],
        limit=n,
    ).to_list(length=n)
    docs.reverse()
    return [serialize_doc(d, exclude=_READING_EXCLUDE) for d in docs]


async def get_latest_prediction(db, sensor_id: str) -> dict | None:
    doc = await db.predictions.find_one(
        {"sensor_id": sensor_id},
        sort=[("time", -1)],
    )
    return serialize_doc(doc, exclude=_PREDICT_EXCLUDE) if doc else None


async def build_ws_payload(db, sensor_id: str, n: int = 25) -> dict:
    online = await is_sensor_online(db, sensor_id)
    history = await get_sensor_history(db, sensor_id, n=n)
    latest = history[-1] if history else None
    prediction = await get_latest_prediction(db, sensor_id)
    return {
        "sensor_id": sensor_id,
        "status": "online" if online else "offline",
        "latest": latest,
        "prediction": prediction,
        "history": history,
        "server_time": datetime.utcnow().isoformat(),
    }



@app.on_event("startup")
async def startup():
    await motor_connect()
    db = get_db()
    collections = await db.list_collection_names()
    logger.info("MongoDB collections: %s", collections)
    if "sensor_readings" not in collections:
        await db.create_collection(
            "sensor_readings",
            timeseries={"timeField": "time", "metaField": "sensor_id", "granularity": "seconds"},
        )
        logger.info("Created time series collection 'sensor_readings'")
    if "predictions" not in collections:
        await db.create_collection(
            "predictions",
            timeseries={"timeField": "time", "metaField": "sensor_id", "granularity": "seconds"},
        )
        logger.info("Created time series collection 'predictions'")
    app.state.db = db
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, get_embedder)
    logger.info("Embedding model loaded")
    app.state.poll_task = asyncio.create_task(poll_sensor())


@app.on_event("shutdown")
async def shutdown():
    app.state.poll_task.cancel()
    motor_disconnect()


async def process_reading(reading: SensorReading):
    print(f"[process_reading] called for sensor_id={reading.id}", flush=True)
    try:
        db = get_db()
        sensor = await db.sensors.find_one({"sensor_id": reading.id})
        if sensor is None:
            logger.warning("No sensor metadata found for sensor_id=%s", reading.id)
            return

        temperature_k = reading.temperature + 273.15
        sst_k = reading.sst + 273.15
        ssta = reading.sst - sensor["clim_sst"]
        turbidity_scaled = (1 - (reading.turbidity / 5.0)) * 10
        k = 0.1 + (turbidity_scaled / 10) * 0.9
        light_at_depth = reading.surface_light * math.exp(-k * sensor["depth"])
        now = datetime.utcnow()
        month = now.month
        year = now.year

        cutoff = now - timedelta(days=84)
        pipeline = [
            {"$match": {"sensor_id": reading.id, "time": {"$gte": cutoff}}},
            {"$group": {
                "_id": {"$floor": {"$divide": [{"$subtract": ["$time", cutoff]}, 1000 * 60 * 60 * 24 * 7]}},
                "mean_ssta": {"$avg": "$ssta"},
            }},
            {"$match": {"mean_ssta": {"$gt": 0}}},
            {"$group": {"_id": None, "total": {"$sum": "$mean_ssta"}}},
        ]
        print("Data logged - awaiting db", flush=True)
        agg = await db.sensor_readings.aggregate(pipeline).to_list(length=1)
        ssta_dhw = (agg[0]["total"] / 7) if agg else 0

        doc = {
            "sensor_id": reading.id,
            "time": now,
            "temperature_k": temperature_k,
            "sst_k": sst_k,
            "ssta": ssta,
            "ssta_dhw": ssta_dhw,
            "turbidity": turbidity_scaled,
            "ph": reading.ph,
            "surface_light": reading.surface_light,
            "light_at_depth": light_at_depth,
            "month": month,
            "year": year,
            "salinity": sensor.get("salinity", 33.5),
        }

        result = await db.sensor_readings.insert_one(doc)
        doc["_id"] = result.inserted_id

        text_repr = reading_text_repr(doc)
        loop = asyncio.get_event_loop()
        embedding = await loop.run_in_executor(None, embed, text_repr)
        await db.sensor_embeddings.insert_one({
            "sensor_id": reading.id,
            "time": now,
            "reading_id": result.inserted_id,
            "text_repr": text_repr,
            "embedding": embedding,
        })

        await db.sensors.update_one(
            {"sensor_id": reading.id},
            {"$set": {"online": True, "last_seen": now}},
            upsert=False,
        )

        _sensor_reading_counts[reading.id] += 1
        count = _sensor_reading_counts[reading.id]
        print(f"[sensor {reading.id}] inserted reading #{count} (LLM fires at multiples of {LLM_WINDOW})", flush=True)

        if count % LLM_WINDOW == 0:
            recent = await db.sensor_readings.find(
                {"sensor_id": reading.id},
                sort=[("time", -1)],
                limit=LLM_WINDOW,
            ).to_list(length=LLM_WINDOW)
            recent.reverse()
            await run_llm_prediction(recent, db)

        if manager.is_connected(reading.id):
            payload = await build_ws_payload(db, reading.id, n=1)
            await manager.broadcast(reading.id, payload)
    except Exception as e:
        print(f"[process_reading] EXCEPTION for sensor_id={reading.id}: {e}", flush=True)
        logger.exception("Error processing reading for sensor_id=%s", reading.id)


@app.post("/ingest", status_code=202)
async def ingest(payload: IngestPayload):
    for reading in payload.sensor_values:
        task = asyncio.create_task(process_reading(reading))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)
    return {"status": "accepted", "count": len(payload.sensor_values)}


@app.get("/sensors/{sensor_id}/history")
async def sensor_history(sensor_id: str, limit: int = 50):
    return {"status": "not implemented"}


@app.post("/predict/{sensor_id}")
async def predict(sensor_id: str):
    db = get_db()
    recent = await db.sensor_readings.find(
        {"sensor_id": sensor_id},
        sort=[("time", -1)],
        limit=LLM_WINDOW,
    ).to_list(length=LLM_WINDOW)
    if not recent:
        return {"status": "error", "message": f"No readings found for sensor_id={sensor_id}"}
    recent.reverse()
    logger.info("Manual LLM predict triggered for sensor_id=%s with %d docs", sensor_id, len(recent))
    await run_llm_prediction(recent, db)
    pred = await db.predictions.find_one({"sensor_id": sensor_id}, sort=[("time", -1)])
    return {
        "status": "ok",
        "sensor_id": sensor_id,
        "docs_used": len(recent),
        "prediction": {
            "risk_level": pred["risk_level"],
            "bleaching_pct": pred["bleaching_pct"],
            "risk_7d": pred["risk_7d"],
            "risk_14d": pred["risk_14d"],
            "risk_description": pred["risk_description"],
            "notices": pred["notices"],
            "next_steps": pred["next_steps"],
        }
    }


@app.websocket("/ws/{sensor_id}")
async def websocket_endpoint(websocket: WebSocket, sensor_id: str):
    await manager.connect(websocket, sensor_id)
    snapshot = await build_ws_payload(app.state.db, sensor_id)
    await websocket.send_json(snapshot)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        manager.disconnect(websocket, sensor_id)


@app.post("/chat")
async def chat(request: ChatRequest):
    return await rag_chat(request, app)


@app.post("/settings/thresholds")
async def set_thresholds(body: dict):
    return {"status": "not implemented"}


@app.post("/settings/contact")
async def set_contact(body: dict):
    return {"status": "not implemented"}


@app.get("/alerts")
async def get_alerts():
    return {"status": "not implemented"}


@app.get("/health")
async def health():
    return {"status": "ok"}
