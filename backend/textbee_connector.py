
import logging
import os

import httpx
import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_TEXTBEE_BASE = "https://api.textbee.dev/api/v1"


async def send_sms(phone: str, message: str) -> bool:
    api_key = os.getenv("TEXTBEE_API_KEY")
    device_id = os.getenv("TEXTBEE_DEVICE_ID")
    if not api_key or not device_id:
        logger.error("TextBee credentials not configured")
        return False
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{_TEXTBEE_BASE}/gateway/devices/{device_id}/send-sms",
                headers={"x-api-key": api_key},
                json={"recipients": [phone], "message": message},
                timeout=10.0,
            )
            response.raise_for_status()
            logger.info("SMS sent to %s", phone)
            return True
    except Exception as e:
        logger.error("SMS failed: %s", e)
        return False


class TextBeeConnector:
    """
    TextBeeConnector: A simple connector to interact with the TextBee API for sending SMS messages.
    Example usage:
    
    from textbee_connector import TextBeeConnector

    textbee = TextBeeConnector()
    response = textbee.send_sms("+15109487551", "Hello from the test.py!")
    print(response.text)
    print(textbee.TEXTBEE_API_KEY, textbee.TEXTBEE_DEVICE_ID)


    """

    def __init__(self, project_env=".env"):
        self.TEXTBEE_API_KEY = os.getenv("TEXTBEE_API_KEY")
        self.TEXTBEE_DEVICE_ID = os.getenv("TEXTBEE_DEVICE_ID")
        print(self.TEXTBEE_API_KEY, self.TEXTBEE_DEVICE_ID)

    def send_sms(self, to, message):
        url = "https://api.textbee.dev/api/v1"
        try:
            response = requests.post(f'{url}/gateway/devices/{self.TEXTBEE_DEVICE_ID}/send-sms', 
                        json={'recipients': [to], 'message': message},headers={'x-api-key': self.TEXTBEE_API_KEY})
        except Exception as e:
            print(f"Error sending SMS: {e}")
            return {"status": "error", "message": str(e)}
        return response







