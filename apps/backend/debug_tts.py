
import asyncio
import os
import sys
import httpx
from dotenv import load_dotenv

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

async def main():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(env_path)
    
    api_key = os.getenv("MINIMAX_API_KEY")
    group_id = os.getenv("MINIMAX_GROUP_ID")
    url = "https://api.minimax.chat/v1/t2a_v2"
    
    print(f"Testing Minimax TTS with key: {api_key[:10]}...")
    print(f"Group ID: {group_id}")
    
    payload = {
        "model": "speech-01-turbo",
        "text": "Hello world",
        "stream": False,
        "voice_setting": {"voice_id": "male-qn-qingse"},
        "audio_setting": {"sample_rate": 32000, "channel": 1, "format": "mp3"}
    }
    
    # Trial 1: Bearer Token (Standard)
    print("\n[Trial 1] Authorization: Bearer <key>")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    # Append GroupId to URL
    url_with_group = f"{url}?GroupId={group_id}"
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url_with_group, json=payload, headers=headers, timeout=10)
            print(f"Status: {resp.status_code}")
            print(f"Response: {resp.text[:200]}")
            if resp.status_code == 200 and "audio" in resp.json().get("data", {}):
                print("SUCCESS with Bearer!")
                with open("test_output.mp3", "wb") as f:
                    f.write(bytes.fromhex(resp.json()["data"]["audio"]))
                return
        except Exception as e:
            print(f"Error: {e}")

    # Trial 2: Raw Token
    print("\n[Trial 2] Authorization: <key>")
    headers["Authorization"] = api_key
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url_with_group, json=payload, headers=headers, timeout=10)
            print(f"Status: {resp.status_code}")
            print(f"Response: {resp.text[:200]}")
            if resp.status_code == 200 and "audio" in resp.json().get("data", {}):
                 print("SUCCESS with Raw Token!")
                 with open("test_output.mp3", "wb") as f:
                    f.write(bytes.fromhex(resp.json()["data"]["audio"]))
                 return
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
