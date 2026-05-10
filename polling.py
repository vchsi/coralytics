import asyncio
import logging

import httpx

SENSOR_URL = "http://localhost:6767/sensor_poll"
INGEST_URL = "http://localhost:8000/ingest"
POLL_INTERVAL = 5

logger = logging.getLogger(__name__)


async def poll_sensor():
    async with httpx.AsyncClient() as client:
        while True:
            try:
                response = await client.get(SENSOR_URL)
                payload = response.json()
                ingest_response = await client.post(INGEST_URL, json=payload)
                logger.info("Ingest response: %s", ingest_response.status_code)
            except Exception as e:
                logger.error("Polling error: %s", e)
            await asyncio.sleep(POLL_INTERVAL)
