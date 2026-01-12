
import asyncio
import os
import sys
from dotenv import load_dotenv

# Add project root to path to import apps properly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from apps.backend.minimax_client import MinimaxClient

async def main():
    # Load .env explicitly
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(env_path)
    
    print(f"Loading env from {env_path}")
    key = os.getenv("MINIMAX_API_KEY")
    print(f"MINIMAX_API_KEY present: {bool(key)}")
    print(f"MINIMAX_GROUP_ID: {os.getenv('MINIMAX_GROUP_ID')}")
    print(f"MINIMAX_API_URL: {os.getenv('MINIMAX_API_URL')}")

    client = MinimaxClient()
    text = "Hello! This is a test of the Minimax text to speech engine. I hope I sound natural."
    print(f"Generating speech for: '{text}'...")
    
    audio_hex = await client.generate_speech(text)
    
    if audio_hex:
        print("Success! Audio generated.")
        output_file = "test_output.mp3"
        try:
            audio_bytes = bytes.fromhex(audio_hex)
            with open(output_file, "wb") as f:
                f.write(audio_bytes)
            print(f"Audio saved to {os.path.abspath(output_file)}")
        except Exception as e:
            print(f"Error saving audio: {e}")
    else:
        print("Failed to generate audio.")

if __name__ == "__main__":
    asyncio.run(main())
