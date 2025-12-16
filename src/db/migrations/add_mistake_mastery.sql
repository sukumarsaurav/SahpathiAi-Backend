-- Enhanced Mistake Practice System Migration
-- Adds mastery tracking and smart set features to user_mistakes

-- Add mastery tracking columns
ALTER TABLE user_mistakes 
  ADD COLUMN IF NOT EXISTS consecutive_correct INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_correct INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mastery_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS next_review_date DATE,
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS last_correct_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_taken_avg INTEGER DEFAULT 0;

-- Add constraint for mastery_status values
ALTER TABLE user_mistakes 
  DROP CONSTRAINT IF EXISTS user_mistakes_mastery_status_check;
ALTER TABLE user_mistakes 
  ADD CONSTRAINT user_mistakes_mastery_status_check 
  CHECK (mastery_status IN ('not_started', 'practicing', 'mastered'));

-- Index for efficient set queries
CREATE INDEX IF NOT EXISTS idx_user_mistakes_mastery 
  ON user_mistakes(user_id, mastery_status);

CREATE INDEX IF NOT EXISTS idx_user_mistakes_retry_level 
  ON user_mistakes(user_id, retry_count);

CREATE INDEX IF NOT EXISTS idx_user_mistakes_review_date 
  ON user_mistakes(user_id, next_review_date) 
  WHERE next_review_date IS NOT NULL;

-- Populate difficulty from questions table for existing mistakes
UPDATE user_mistakes um
SET difficulty = q.difficulty
FROM questions q
WHERE um.question_id = q.id
AND um.difficulty IS NULL;

-- Comment explaining the schema
COMMENT ON COLUMN user_mistakes.consecutive_correct IS 'Consecutive correct answers, resets on wrong';
COMMENT ON COLUMN user_mistakes.total_correct IS 'Total times answered correctly';
COMMENT ON COLUMN user_mistakes.mastery_status IS 'not_started -> practicing -> mastered';
COMMENT ON COLUMN user_mistakes.next_review_date IS 'Spaced repetition: when to show again after mastery';
COMMENT ON COLUMN user_mistakes.difficulty IS 'Denormalized from questions for set grouping';
COMMENT ON COLUMN user_mistakes.last_correct_at IS 'Timestamp of last correct answer';
COMMENT ON COLUMN user_mistakes.time_taken_avg IS 'Average time taken to answer this question';
