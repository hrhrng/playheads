-- ============================================================================
-- Enable Row Level Security on all application tables
--
-- After this migration:
--   - anon key can only access rows belonging to the authenticated user
--   - service_role key bypasses RLS (used by backend)
-- ============================================================================

-- 1. profiles: users can only read/update their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());


-- 2. conversations: users can only access their own conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own conversations"
  ON conversations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (user_id = auth.uid());


-- 3. conversation_states: access via conversation ownership
ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversation states"
  ON conversation_states FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_states.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own conversation states"
  ON conversation_states FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_states.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own conversation states"
  ON conversation_states FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_states.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own conversation states"
  ON conversation_states FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_states.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );
