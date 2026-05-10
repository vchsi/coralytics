

import requests
from dotenv import load_dotenv
import os


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

        load_dotenv()
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







