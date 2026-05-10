import logging
import os

import certifi
import pymongo
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

load_dotenv()

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGODB_URL")
MONGO_CLUSTER_NAME = os.getenv("MONGODB_NAME", "hackdavisdb")

_motor_client: AsyncIOMotorClient | None = None
_motor_db: AsyncIOMotorDatabase | None = None


async def motor_connect() -> AsyncIOMotorDatabase:
    global _motor_client, _motor_db
    _motor_client = AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    _motor_db = _motor_client[MONGO_CLUSTER_NAME]
    logger.info("Connected to MongoDB database '%s'", MONGO_CLUSTER_NAME)
    return _motor_db


def motor_disconnect():
    if _motor_client:
        _motor_client.close()
        logger.info("Disconnected from MongoDB")


def get_db() -> AsyncIOMotorDatabase:
    return _motor_db


def get_collection(name: str):
    return _motor_db[name]


"""
HackDavis Project - Collection Schemas

## sensors

Stores static metadata for each physical reef sensor. `clim_sst` is the
climatological baseline SST used to compute SSTA. `depth` (meters) drives the
light-attenuation calculation in process_reading.


---

## sensor_readings

Time series collection (timeField=`time`, metaField=`sensor_id`, granularity=seconds).
Each document is written by `process_reading` in ws.py after one polling cycle.
`turbidity` is rescaled to 0–10 (higher = clearer water). `ssta_dhw` is the
running 12-week degree heating week accumulator.

```json
{
  "sensor_id": "1",
  "time": "2026-05-09T00:00:00Z",
  "temperature_k": 295.65,
  "sst_k": 298.15,
  "ssta": 0.5,
  "ssta_dhw": 1.2,
  "turbidity": 8.4,
  "ph": 7.2,
  "surface_light": 300,
  "light_at_depth": 243.5,
  "month": 5,
  "year": 2026
}
```

---

## predictions

Stores structured LLM outputs generated after each sensor reading cycle. Each
document represents the model's coral bleaching risk assessment and recommended
actions for a given sensor at a point in time. Alert delivery metadata
(`alert_sent`, `alert_type`) is co-located here so the alert pipeline can avoid
duplicate notifications.

```json
{
  "sensor_id": "1",
  "timestamp": "2026-05-09T00:00:00Z",
  "risk_pct": 67.5,
  "trend_direction": "rising",
  "notices": [
    "SSTA has exceeded 1°C for 3 consecutive weeks.",
    "pH dropping toward acidification threshold."
  ],
  "recommended_next_steps": [
    "Increase monitoring frequency for this sensor.",
    "Alert local reef management team."
  ],
  "confidence": 0.84,
  "predicted_values": {
    "ssta": 0.9,
    "ph": 7.9,
    "turbidity": 6.0
  },
  "anomaly_detected": true,
  "anomaly_type": "drift",
  "severity": "medium",
  "anomaly_description": "Gradual upward SSTA drift over the past 3 weeks with concurrent pH decline.",
  "affected_metrics": ["ssta", "ph"],
  "threshold_breached": false,
  "alert_sent": true,
  "alert_type": "sms"
}
```

---

## llm_logs

Captures every raw interaction with the LLM for debugging, auditing, and
fine-tune feedback collection. `fallback_used` flags responses where parse
failure caused the system to reuse the last valid prediction.

```json
{
  "timestamp": "2026-05-09T00:00:05Z",
  "mode": "prediction",
  "sensor_id": "1",
  "prompt_summary": "Assess coral bleaching risk for sensor 1. Recent readings: ssta=0.5, ph=7.2, turbidity=8.4",
  "raw_output": "{\"risk_pct\": 67.5, \"trend_direction\": \"rising\", \"notices\": [\"SSTA exceeded 1°C\"], \"confidence\": 0.84, \"anomaly_detected\": true}",
  "parse_success": true,
  "confidence": 0.84,
  "fallback_used": false,
  "latency_ms": 1342
}
```

---

## users

Stores registered user accounts and their sensor subscriptions and alerting
preferences. `warn_risk_pct` triggers an SMS (TextBee) and `critical_risk_pct`
triggers a voice call (ElevenLabs). `pending_dynamic_thresholds` accumulates
LLM-suggested threshold adjustments awaiting user approval.

```json
{
  "user_id": "a3f1c2d4-8b7e-4e2a-9c0f-1d6b5e3a2f87",
  "phone": "+15105550192",
  "registered_sensors": ["1", "2", "3"],
  "thresholds": {
    "warn_risk_pct": 55.0,
    "critical_risk_pct": 80.0,
    "raw_thresholds": {
      "ssta": { "warn": 1.0, "critical": 2.0 },
      "ph": { "warn": 7.8, "critical": 7.6 },
      "turbidity": { "warn": 3.0, "critical": 1.0 }
    }
  },
  "pending_dynamic_thresholds": [
    {
      "suggested_by": "llm",
      "metric": "ssta",
      "suggested_value": 0.8,
      "suggested_at": "2026-05-08T00:00:00Z",
      "status": "pending"
    }
  ]
}
```

---

## snapshots

Tracks exports of historical sensor readings compiled for LLM fine-tuning jobs.
Each snapshot covers a contiguous time window for a single sensor and points to
a compressed CSV on disk or object storage.

```json
{
  "snapshot_id": "d7e2b1a9-3f4c-4d8e-bc21-9a0f6e5c7d43",
  "sensor_id": "1",
  "created_at": "2026-05-09T00:00:00Z",
  "row_count": 8640,
  "file_path": "snapshots/sensor-1/1746643200.csv.gz",
  "status": "complete",
  "fine_tune_job_id": "ftjob-20260508-001",
  "rows_from": "2026-04-25T00:00:00Z",
  "rows_to": "2026-05-09T00:00:00Z"
}
```

"""

class MongoDBConnector:
    default_db_name = ""
    def __init__(self, project_env=".env"):
        load_dotenv(dotenv_path=project_env, override=True)
        try:
            self.url = os.getenv("MONGODB_URL")
            self.client = pymongo.MongoClient(self.url, tlsCAFile=certifi.where())
            print("MongoDB client initialized successfully.")
        except Exception as e:
            print(f"Error initializing MongoDB client: {e}")
            self.client = None

    def set_default_db(self, db_name):
        self.default_db_name = db_name

    def insert_data(self, collection_name, db_name=None, data=None):
        if not self.client:
            print("MongoDB client not initialized.")
            return {"status": "error", "message": "MongoDB client not initialized."}
        try:
            db = self.client[db_name] if db_name else self.client[self.default_db_name]
            collection = db[collection_name]
            result = collection.insert_one(data)
            print("Success")
            return {"status": "success", "inserted_id": str(result.inserted_id)}
        except Exception as e:
            print(f"Error inserting data into MongoDB: {e}")
            return {"status": "error", "message": str(e)}
    
    def pull_data(self,  collection_name,db_name=None, query=None):
        if not self.client:
            print("MongoDB client not initialized.")
            return {"status": "error", "message": "MongoDB client not initialized."}
        try:
            db = self.client[db_name] if db_name else self.client[self.default_db_name]
            collection = db[collection_name]
            if query:
                results = collection.find(query)
            else:
                results = collection.find()
            return {"status": "success", "data": [result for result in results]}
        except Exception as e:
            print(f"Error pulling data from MongoDB: {e}")
            return {"status": "error", "message": str(e)}
    
    def pull_by_timerange(self, collection_name, db_name=None, start_time=None, end_time=None):
        if not self.client:
            print("MongoDB client not initialized.")
            return {"status": "error", "message": "MongoDB client not initialized."}
        try:
            db = self.client[db_name] if db_name else self.client[self.default_db_name]
            collection = db[collection_name]
            query = {}
            if start_time and end_time:
                query["timestamp"] = {"$gte": start_time, "$lte": end_time}
            elif start_time:
                query["timestamp"] = {"$gte": start_time}
            elif end_time:
                query["timestamp"] = {"$lte": end_time}
            results = collection.find(query)
            return {"status": "success", "data": [result for result in results]}
        except Exception as e:
            print(f"Error pulling data from MongoDB: {e}")
            return {"status": "error", "message": str(e)}