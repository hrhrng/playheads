"""
Quick migration script to apply database changes
Run this: python apply_migration.py
"""
import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine

# Load environment variables
load_dotenv()

async def apply_migration():
    """Apply the conversation enhancement migration"""

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL not found in environment")
        return False

    # Convert to async URL
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(database_url)

    # Read migration SQL
    migration_sql = """
-- Add new columns to conversations table
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_message_preview TEXT,
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Make title nullable
ALTER TABLE conversations
ALTER COLUMN title DROP NOT NULL;

ALTER TABLE conversations
ALTER COLUMN title DROP DEFAULT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
ON conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned
ON conversations (user_id, is_pinned DESC, updated_at DESC);

-- Update existing conversations
UPDATE conversations
SET
    message_count = 0,
    is_pinned = FALSE,
    is_archived = FALSE
WHERE message_count IS NULL;
"""

    try:
        from sqlalchemy import text

        async with engine.begin() as conn:
            # Split and execute each statement
            statements = [
                "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0",
                "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT",
                "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE",
                "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE",
                "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE",
                "ALTER TABLE conversations ALTER COLUMN title DROP NOT NULL",
                "ALTER TABLE conversations ALTER COLUMN title DROP DEFAULT",
                "CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations (user_id, updated_at DESC)",
                "CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned ON conversations (user_id, is_pinned DESC, updated_at DESC)",
                "UPDATE conversations SET message_count = 0, is_pinned = FALSE, is_archived = FALSE WHERE message_count IS NULL",
            ]

            for statement in statements:
                print(f"Executing: {statement[:60]}...")
                await conn.execute(text(statement))

        print("✅ Migration applied successfully!")
        return True
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await engine.dispose()

if __name__ == "__main__":
    print("🔧 Applying database migration...")
    success = asyncio.run(apply_migration())
    if success:
        print("\n✅ Database is ready! You can now start the server.")
    else:
        print("\n❌ Migration failed. Please check the error above.")
