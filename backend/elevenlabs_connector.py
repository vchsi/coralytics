import logging

logger = logging.getLogger(__name__)


async def make_voice_call(phone: str, sensor_id: str, prediction: dict) -> bool:
    # ElevenLabs voice agent integration — to be implemented
    logger.info("Voice call stub called for %s, sensor %s", phone, sensor_id)
    return True
