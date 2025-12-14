-- Marathon Mode Enhancement Migration
-- Adds last_question_id column to marathon_sessions table
-- This tracks the last shown question to prevent consecutive repeats

ALTER TABLE marathon_sessions 
ADD COLUMN IF NOT EXISTS last_question_id UUID REFERENCES questions(id);

COMMENT ON COLUMN marathon_sessions.last_question_id IS 'Tracks the last shown question to prevent showing the same question twice in a row';
