import asyncio
import json
import logging
import math
import os
from datetime import datetime, timedelta
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from llm_connector import maybe_run_llm
from mongodb_connector import get_db, motor_connect, motor_disconnect
from polling import poll_sensor

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
        connections = self.active_connections.get(sensor_id, [])
        if websocket in connections:
            connections.remove(websocket)
        logger.info("WebSocket disconnected for sensor %s", sensor_id)

    async def broadcast(self, sensor_id: str, data: dict):
        for ws in self.active_connections.get(sensor_id, []):
            await ws.send_text(json.dumps(data))


manager = ConnectionManager()



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
    app.state.poll_task = asyncio.create_task(poll_sensor())


@app.on_event("shutdown")
async def shutdown():
    app.state.poll_task.cancel()
    motor_disconnect()


async def process_reading(reading: SensorReading):
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
        logger.info("Inserted sensor_reading for sensor_id=%s id=%s", reading.id, result.inserted_id)
        await maybe_run_llm(doc, db)

    except Exception:
        logger.exception("Error processing reading for sensor_id=%s", reading.id)


@app.post("/ingest", status_code=202)
async def ingest(payload: IngestPayload):
    for reading in payload.sensor_values:
        asyncio.create_task(process_reading(reading))
    return {"status": "accepted", "count": len(payload.sensor_values)}


@app.get("/sensors/{sensor_id}/history")
async def sensor_history(sensor_id: str, limit: int = 50):
    return {"status": "not implemented"}


@app.websocket("/ws/{sensor_id}")
async def websocket_endpoint(websocket: WebSocket, sensor_id: str):
    await manager.connect(websocket, sensor_id)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        manager.disconnect(websocket, sensor_id)


@app.post("/chat")
async def chat(body: dict):
    return PlainTextResponse("not implemented")


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
