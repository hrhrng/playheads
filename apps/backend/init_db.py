"""
Initialize SQLite database with all tables
Run: uv run python init_db.py
"""
import asyncio
from apps.backend.database import engine, Base
from apps.backend.models import Profile, Conversation, ConversationState

async def init_db():
    """Create all database tables"""
    print("🔧 Creating SQLite database tables...")

    try:
        async with engine.begin() as conn:
            # Drop all tables (for clean start)
            await conn.run_sync(Base.metadata.drop_all)
            print("✅ Dropped existing tables")

            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
            print("✅ Created all tables")

        print("\n✅ Database initialized successfully!")
        print("📁 Database file: playheads.db")
        return True
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await engine.dispose()

if __name__ == "__main__":
    success = asyncio.run(init_db())
    if success:
        print("\n✅ You can now start the server!")
    else:
        print("\n❌ Initialization failed. Please check the error above.")
