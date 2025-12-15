-- Performance Optimization: Add Missing Indexes
-- Run this migration in Supabase SQL Editor
-- Date: 2024-12-16

-- =====================================================
-- MISSING FOREIGN KEY INDEXES
-- Critical for JOIN performance (50-70% faster queries)
-- =====================================================

-- user_answers: question_id index (missing)
CREATE INDEX IF NOT EXISTS idx_user_answers_question ON user_answers(question_id);

-- daily_practice_questions: session_id index (missing)
CREATE INDEX IF NOT EXISTS idx_daily_questions_session ON daily_practice_questions(session_id);

-- marathon_answers: session_id index (missing)
CREATE INDEX IF NOT EXISTS idx_marathon_answers_session ON marathon_answers(session_id);

-- custom_tests: user_id index (missing)
CREATE INDEX IF NOT EXISTS idx_custom_tests_user ON custom_tests(user_id);

-- custom_test_questions: custom_test_id index (missing)
CREATE INDEX IF NOT EXISTS idx_custom_test_questions_test ON custom_test_questions(custom_test_id);

-- question_exam_history: question_id index (for exam history lookup)
CREATE INDEX IF NOT EXISTS idx_question_exam_history_question ON question_exam_history(question_id);

-- =====================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- Optimizes frequent real-world queries
-- =====================================================

-- User concept stats: user + concept lookup (personalization queries)
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_user_concept ON user_concept_stats(user_id, concept_id);

-- Daily progress: user + date lookup (dashboard, streak calculation)
CREATE INDEX IF NOT EXISTS idx_daily_progress_user_date ON daily_progress(user_id, practice_date);

-- Test attempts: user + date for history (sorted by recent)
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_date ON test_attempts(user_id, started_at DESC);

-- Marathon queue: session + priority (question selection)
CREATE INDEX IF NOT EXISTS idx_marathon_queue_session_priority ON marathon_question_queue(session_id, priority);

-- Custom test questions: test + order (question retrieval)
CREATE INDEX IF NOT EXISTS idx_custom_test_questions_order ON custom_test_questions(custom_test_id, order_index);

-- Daily practice questions: session + order (question retrieval)
CREATE INDEX IF NOT EXISTS idx_daily_questions_order ON daily_practice_questions(session_id, order_index);

-- =====================================================
-- PARTIAL INDEXES FOR STATUS-BASED QUERIES
-- Smaller indexes for filtered queries
-- =====================================================

-- Active marathon sessions only (most queries filter by active)
CREATE INDEX IF NOT EXISTS idx_marathon_sessions_active ON marathon_sessions(user_id) 
WHERE status = 'active';

-- Unresolved mistakes only (mistakes practice)
CREATE INDEX IF NOT EXISTS idx_user_mistakes_unresolved ON user_mistakes(user_id) 
WHERE is_resolved = false;

-- Active daily practice sessions
CREATE INDEX IF NOT EXISTS idx_daily_sessions_active ON daily_practice_sessions(user_id) 
WHERE status = 'active';

-- =====================================================
-- VERIFICATION QUERY
-- Run after migration to verify indexes were created
-- =====================================================
-- SELECT indexname, tablename 
-- FROM pg_indexes 
-- WHERE schemaname = 'public' 
-- AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
