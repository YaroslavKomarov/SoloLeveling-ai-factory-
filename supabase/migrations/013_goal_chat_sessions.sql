-- Migration 013: Goal Chat Sessions
-- Multi-session expert chat system for goals.
-- Each session is an independent conversation thread (task-specific or general).
-- Messages are stored per-session and support context compression via is_compressed_summary.

-- Session container (one per conversation thread)
CREATE TABLE goal_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('task', 'general')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'readonly')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON goal_chat_sessions(goal_id, last_message_at DESC);
ALTER TABLE goal_chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own sessions" ON goal_chat_sessions
  FOR ALL USING (user_id = auth.uid());

-- Messages within a session
CREATE TABLE goal_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES goal_chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  is_compressed_summary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON goal_chat_messages(session_id, created_at);
ALTER TABLE goal_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own messages" ON goal_chat_messages
  FOR ALL USING (user_id = auth.uid());
