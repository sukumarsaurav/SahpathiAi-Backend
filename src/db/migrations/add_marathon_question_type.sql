-- Migration: Add question_type support to Marathon
-- This adds question_type column to marathon_sessions and text_answer column to marathon_answers

-- Add question_type to marathon_sessions
ALTER TABLE marathon_sessions 
ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'fill_blank'));

COMMENT ON COLUMN marathon_sessions.question_type IS 'Type of questions in this session: mcq for multiple choice, fill_blank for fill-in-the-blank';

-- Add text_answer to marathon_answers for fill_blank questions
ALTER TABLE marathon_answers 
ADD COLUMN IF NOT EXISTS text_answer TEXT;

COMMENT ON COLUMN marathon_answers.text_answer IS 'User text answer for fill_blank questions';

-- Allow selected_option to be null for fill_blank questions
-- (It should already allow NULL based on schema, but let's ensure)
ALTER TABLE marathon_answers 
ALTER COLUMN selected_option DROP NOT NULL;
