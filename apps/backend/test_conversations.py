import asyncio
import httpx
import uuid
import json
import os
import sys

BASE_URL = "http://localhost:8000"
# Use an existing user ID from the database to satisfy foreign key constraints
USER_ID = "748e99b9-41d1-4beb-baae-d6cd7f7e9a6a"
SESSION_ID = str(uuid.uuid4())

async def test_conversation_flow():
    print(f"🧪 Testing Conversation Flow for User: {USER_ID}")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=60.0) as client:
        # 1. Health Check
        print("\n1. Checking Health...")
        resp = await client.get("/health")
        print(f"Status: {resp.status_code}, Body: {resp.json()}")
        assert resp.status_code == 200

        # 2. Create/Start Chat (Simulate first message)
        print(f"\n2. Sending First Message (Session: {SESSION_ID})...")
        payload = {
            "message": "Hello, play some jazz!",
            "session_id": SESSION_ID,
            "user_id": USER_ID
        }
        resp = await client.post("/chat", json=payload)
        print(f"Status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"Error: {resp.text}")
            return

        data = resp.json()
        print(f"Response: {data['response'][:50]}...")
        assert data['session_id'] == SESSION_ID

        # 3. List Conversations
        print("\n3. Listing Conversations...")
        resp = await client.get(f"/conversations?user_id={USER_ID}")
        assert resp.status_code == 200
        convs = resp.json()['conversations']
        print(f"Found {len(convs)} conversations")

        # Find our conversation
        target_conv = next((c for c in convs if c['id'] == SESSION_ID), None)
        assert target_conv is not None, f"Session {SESSION_ID} not found in conversations list"

        print(f"Conversation found: {target_conv['title']} (Pinned: {target_conv['is_pinned']})")

        # 4. Pin Conversation
        print("\n4. Pinning Conversation...")
        resp = await client.patch(
            f"/conversations/{SESSION_ID}",
            params={"user_id": USER_ID},
            json={"is_pinned": True}
        )
        assert resp.status_code == 200
        print(f"Pin Result: {resp.json()}")

        # 5. Verify Pin State
        print("\n5. Verifying Pin State...")
        resp = await client.get(f"/conversations?user_id={USER_ID}")
        convs = resp.json()['conversations']
        assert convs[0]['is_pinned'] == True
        print("✅ Conversation is pinned")

        # 6. Unpin Conversation
        print("\n6. Unpinning Conversation...")
        resp = await client.patch(
            f"/conversations/{SESSION_ID}",
            params={"user_id": USER_ID},
            json={"is_pinned": False}
        )
        assert resp.status_code == 200

        # 7. Delete Conversation
        print("\n7. Deleting Conversation...")
        resp = await client.delete(f"/conversations/{SESSION_ID}", params={"user_id": USER_ID})
        assert resp.status_code == 200
        print(f"Delete Result: {resp.json()}")

        # 8. Verify Deletion
        print("\n8. Verifying Deletion...")
        resp = await client.get(f"/conversations?user_id={USER_ID}")
        convs = resp.json()['conversations']

        # Verify our session is gone
        deleted_conv = next((c for c in convs if c['id'] == SESSION_ID), None)
        assert deleted_conv is None, f"Session {SESSION_ID} still exists in conversations list"
        print("✅ Conversation successfully removed from list")

    print("\n✨ All tests passed!")

if __name__ == "__main__":
    asyncio.run(test_conversation_flow())
