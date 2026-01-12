
import httpx
import os
import json
import logging

logger = logging.getLogger(__name__)

class MinimaxClient:
    def __init__(self):
        self.api_key = os.getenv("MINIMAX_API_KEY")
        self.group_id = os.getenv("MINIMAX_GROUP_ID")
        self.api_url = os.getenv("MINIMAX_API_URL", "https://api.minimax.io/v1/t2a_v2")
        
    async def generate_speech(self, text: str, voice_id: str = "English_expressive_narrator") -> str | None:
        """
        Generate speech from text using Minimax TTS.
        Returns the hex-encoded audio string or None if failed.
        """
        if not self.api_key:
            logger.warning("MINIMAX_API_KEY not set")
            return None
            
        if not text:
            return None

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        # Append GroupId to URL if required and present
        url = self.api_url
        if self.group_id:
             if "?" in url:
                 url += f"&GroupId={self.group_id}"
             else:
                 url += f"?GroupId={self.group_id}"

        payload = {
            "model": "speech-2.6-hd",
            "text": text,
            "stream": False,
            "voice_setting": {
                "voice_id": voice_id,
                "speed": 1.0,
                "vol": 1.0,
                "pitch": 0
            },
            "audio_setting": {
                "sample_rate": 32000,
                "bitrate": 128000,
                "format": "mp3",
                "channel": 1
            },
            "output_format": "hex"
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=headers, timeout=30.0)
                
                if response.status_code != 200:
                    logger.error(f"Minimax TTS Error: {response.status_code} - {response.text}")
                    return None
                    
                data = response.json()
                
                # Check for API-level errors
                if data.get("base_resp", {}).get("status_code") != 0:
                     msg = data.get("base_resp", {}).get("status_msg")
                     logger.error(f"Minimax API Error: {msg}")
                     return None
                
                if "data" in data and "audio" in data["data"]:
                    return data["data"]["audio"]
                    
                logger.error(f"Unexpected response format: {data}")
                return None
                
            except Exception as e:
                logger.exception(f"Minimax Client Exception: {e}")
                return None

# Singleton instance
minimax_client = MinimaxClient()
