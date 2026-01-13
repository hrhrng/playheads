-- Migration: Enhance Conversation Model
-- Description: Add metadata fields for better conversation management
-- Date: 2026-01-13

-- Add new columns to conversations table
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_message_preview TEXT,
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Make title nullable (will be generated from first message)
ALTER TABLE conversations
ALTER COLUMN title DROP NOT NULL,
ALTER COLUMN title DROP DEFAULT;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
ON conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned
ON conversations (user_id, is_pinned DESC, updated_at DESC);

-- Update existing conversations with default values
UPDATE conversations
SET
    message_count = 0,
    is_pinned = FALSE,
    is_archived = FALSE
WHERE message_count IS NULL;

-- Optional: Set title to NULL for conversations without messages
-- (uncomment if you want to regenerate titles)
-- UPDATE conversations
-- SET title = NULL
-- WHERE message_count = 0 OR title = 'New Conversation';

COMMIT;
