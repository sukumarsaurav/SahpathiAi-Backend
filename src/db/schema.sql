-- Sahpathi.ai Database Schema
-- Run this SQL in Supabase SQL Editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CONTENT MANAGEMENT TABLES
-- =====================================================

-- Exam Categories (Board/Competitive, Govt Jobs, etc.)
CREATE TABLE IF NOT EXISTS exam_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exams (Class 10, SSC CGL, NEET, UPSC, etc.)
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES exam_categories(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  short_name VARCHAR(50),
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(20),
  difficulty_level INT DEFAULT 5 CHECK (difficulty_level >= 1 AND difficulty_level <= 10),
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Languages
CREATE TABLE IF NOT EXISTS languages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  native_name VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0
);

-- Subjects (Master list of subjects)
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL UNIQUE,
  icon VARCHAR(50),
  color VARCHAR(20),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exam Subjects (Junction: Exam <-> Subject)
-- Effectively defines a "Course" or "Syllabus"
CREATE TABLE IF NOT EXISTS exam_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, subject_id)
);

-- Topics (per subject)
-- Links to master subject, but can be specific to an exam if exam_id is set
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE, -- Optional: If set, topic is specific to this exam
  name VARCHAR(200) NOT NULL,
  description TEXT,
  question_count INT DEFAULT 0,
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions (language-independent core data)
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  difficulty VARCHAR(20) DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  correct_answer_index INT NOT NULL CHECK (correct_answer_index >= 0 AND correct_answer_index <= 3),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Question Translations (multi-language support)
CREATE TABLE IF NOT EXISTS question_translations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  language_id UUID REFERENCES languages(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- Array of 4 options
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, language_id)
);

-- Question Exam History (tracks which exams asked this question)
CREATE TABLE IF NOT EXISTS question_exam_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  year_asked INT,
  paper_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resources (learning materials)
CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_subject_id UUID REFERENCES exam_subjects(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL,
  type VARCHAR(50) DEFAULT 'article' CHECK (type IN ('article', 'video', 'pdf', 'link')),
  duration VARCHAR(20),
  url TEXT,
  language_id UUID REFERENCES languages(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USER MANAGEMENT TABLES
-- =====================================================

-- Users (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(200),
  phone VARCHAR(20),
  username VARCHAR(50) UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  date_of_birth DATE,
  location VARCHAR(200),
  role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'admin', 'content_manager')),
  target_exam_id UUID REFERENCES exams(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_language_id UUID REFERENCES languages(id),
  push_notifications BOOLEAN DEFAULT true,
  test_reminders BOOLEAN DEFAULT true,
  dark_mode BOOLEAN DEFAULT false,
  sound_effects BOOLEAN DEFAULT true,
  download_on_wifi BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Stats
CREATE TABLE IF NOT EXISTS user_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  total_tests INT DEFAULT 0,
  total_hours DECIMAL(10, 2) DEFAULT 0,
  avg_score DECIMAL(5, 2) DEFAULT 0,
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  last_activity TIMESTAMPTZ
);

-- Daily Progress
CREATE TABLE IF NOT EXISTS daily_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  practice_date DATE NOT NULL,
  questions_completed INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  target_questions INT DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, practice_date)
);

-- =====================================================
-- WALLET & TRANSACTIONS TABLES
-- =====================================================

-- Wallets
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(10, 2) DEFAULT 0,
  total_earned DECIMAL(10, 2) DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallet Transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  category VARCHAR(50) CHECK (category IN ('referral', 'reward', 'subscription', 'test', 'add_money', 'withdraw')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SUBSCRIPTION TABLES
-- =====================================================

-- Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL,
  price_monthly DECIMAL(10, 2) DEFAULT 0,
  price_yearly DECIMAL(10, 2) DEFAULT 0,
  features JSONB,
  tests_per_month INT, -- NULL = unlimited
  is_active BOOLEAN DEFAULT true
);

-- User Subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- =====================================================
-- REFERRAL TABLES
-- =====================================================

-- Referral Codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL UNIQUE,
  referral_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  reward_amount DECIMAL(10, 2) DEFAULT 15.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- =====================================================
-- TEST TABLES
-- =====================================================

-- Test Categories
CREATE TABLE IF NOT EXISTS test_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(20),
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tests (pre-made tests)
CREATE TABLE IF NOT EXISTS tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID REFERENCES exam_subjects(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id),
  test_category_id UUID REFERENCES test_categories(id),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  duration_minutes INT DEFAULT 30,
  difficulty VARCHAR(20) DEFAULT 'medium',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test Questions (junction table)
CREATE TABLE IF NOT EXISTS test_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_index INT DEFAULT 0
);

-- Test Attempts
CREATE TABLE IF NOT EXISTS test_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  language_id UUID REFERENCES languages(id),
  score INT DEFAULT 0,
  total_questions INT DEFAULT 0,
  percentage INT DEFAULT 0,
  time_taken_seconds INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- User Answers
CREATE TABLE IF NOT EXISTS user_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID REFERENCES test_attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  selected_option INT,
  is_correct BOOLEAN DEFAULT false,
  time_taken_seconds INT DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USER INTERACTIONS TABLES
-- =====================================================

-- Saved Questions
CREATE TABLE IF NOT EXISTS saved_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  notes TEXT,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- User Mistakes (NOT from Marathon mode)
CREATE TABLE IF NOT EXISTS user_mistakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  selected_option INT,
  retry_count INT DEFAULT 0,
  is_resolved BOOLEAN DEFAULT false,
  last_attempted TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- =====================================================
-- CUSTOM TEST TABLES
-- =====================================================

-- Custom Tests (user-generated)
CREATE TABLE IF NOT EXISTS custom_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  exam_subject_id UUID REFERENCES exam_subjects(id),
  selected_topic_ids JSONB,
  total_questions INT DEFAULT 20,
  duration_minutes INT DEFAULT 30,
  status VARCHAR(20) DEFAULT 'generated' CHECK (status IN ('generated', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Custom Test Questions
CREATE TABLE IF NOT EXISTS custom_test_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  custom_test_id UUID REFERENCES custom_tests(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_index INT DEFAULT 0,
  selected_option INT,
  is_correct BOOLEAN,
  time_taken_seconds DECIMAL(10, 2),
  answered_at TIMESTAMPTZ
);

-- =====================================================
-- MARATHON MODE TABLES
-- =====================================================

-- Marathon Sessions
CREATE TABLE IF NOT EXISTS marathon_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  exam_subject_id UUID REFERENCES exam_subjects(id),
  selected_topic_ids JSONB,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'exited')),
  total_questions INT DEFAULT 0,
  questions_answered INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  questions_mastered INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Marathon Question Queue (spaced repetition)
CREATE TABLE IF NOT EXISTS marathon_question_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES marathon_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  priority INT DEFAULT 0,
  times_shown INT DEFAULT 0,
  times_correct INT DEFAULT 0,
  times_wrong INT DEFAULT 0,
  avg_time_seconds DECIMAL(10, 2),
  next_show_at TIMESTAMPTZ,
  is_mastered BOOLEAN DEFAULT false,
  last_shown_at TIMESTAMPTZ
);

-- Marathon Answers
CREATE TABLE IF NOT EXISTS marathon_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES marathon_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  selected_option INT,
  is_correct BOOLEAN DEFAULT false,
  time_taken_seconds DECIMAL(10, 2),
  attempt_number INT DEFAULT 1,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- DAILY PRACTICE TABLES
-- =====================================================

-- Daily Practice Config
CREATE TABLE IF NOT EXISTS daily_practice_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  new_topics_percent INT DEFAULT 40,
  strong_areas_percent INT DEFAULT 20,
  mistakes_percent INT DEFAULT 30,
  time_consuming_percent INT DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily Practice Sessions
CREATE TABLE IF NOT EXISTS daily_practice_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_questions INT DEFAULT 20,
  config_used JSONB,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  questions_answered INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Daily Practice Questions
CREATE TABLE IF NOT EXISTS daily_practice_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES daily_practice_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  category VARCHAR(30) CHECK (category IN ('new_topic', 'strong_area', 'mistake', 'time_consuming')),
  order_index INT DEFAULT 0,
  is_answered BOOLEAN DEFAULT false,
  is_correct BOOLEAN,
  time_taken_seconds DECIMAL(10, 2),
  answered_at TIMESTAMPTZ
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_exams_category ON exams(category_id);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON exam_subjects(exam_id);
CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(exam_subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_question_translations_question ON question_translations(question_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_user ON test_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_test ON test_attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_attempt ON user_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_saved_questions_user ON saved_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mistakes_user ON user_mistakes(user_id);
CREATE INDEX IF NOT EXISTS idx_marathon_sessions_user ON marathon_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_marathon_queue_session ON marathon_question_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_daily_sessions_user ON daily_practice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marathon_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marathon_question_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE marathon_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_practice_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_practice_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_progress ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY users_policy ON users FOR ALL USING (auth.uid() = id);
CREATE POLICY user_preferences_policy ON user_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY user_stats_policy ON user_stats FOR ALL USING (auth.uid() = user_id);
CREATE POLICY wallets_policy ON wallets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY wallet_transactions_policy ON wallet_transactions FOR ALL USING (
  wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid())
);
CREATE POLICY user_subscriptions_policy ON user_subscriptions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY referral_codes_policy ON referral_codes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY referrals_policy ON referrals FOR ALL USING (
  auth.uid() = referrer_id OR auth.uid() = referred_id
);
CREATE POLICY test_attempts_policy ON test_attempts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY user_answers_policy ON user_answers FOR ALL USING (
  attempt_id IN (SELECT id FROM test_attempts WHERE user_id = auth.uid())
);
CREATE POLICY saved_questions_policy ON saved_questions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY user_mistakes_policy ON user_mistakes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY custom_tests_policy ON custom_tests FOR ALL USING (auth.uid() = user_id);
CREATE POLICY custom_test_questions_policy ON custom_test_questions FOR ALL USING (
  custom_test_id IN (SELECT id FROM custom_tests WHERE user_id = auth.uid())
);
CREATE POLICY marathon_sessions_policy ON marathon_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY marathon_queue_policy ON marathon_question_queue FOR ALL USING (
  session_id IN (SELECT id FROM marathon_sessions WHERE user_id = auth.uid())
);
CREATE POLICY marathon_answers_policy ON marathon_answers FOR ALL USING (
  session_id IN (SELECT id FROM marathon_sessions WHERE user_id = auth.uid())
);
CREATE POLICY daily_config_policy ON daily_practice_config FOR ALL USING (auth.uid() = user_id);
CREATE POLICY daily_sessions_policy ON daily_practice_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY daily_questions_policy ON daily_practice_questions FOR ALL USING (
  session_id IN (SELECT id FROM daily_practice_sessions WHERE user_id = auth.uid())
);
CREATE POLICY daily_progress_policy ON daily_progress FOR ALL USING (auth.uid() = user_id);

-- Public read access for content tables
CREATE POLICY exam_categories_read ON exam_categories FOR SELECT USING (true);
CREATE POLICY exams_read ON exams FOR SELECT USING (is_active = true);
CREATE POLICY exam_subjects_read ON exam_subjects FOR SELECT USING (is_active = true);
CREATE POLICY topics_read ON topics FOR SELECT USING (is_active = true);
CREATE POLICY languages_read ON languages FOR SELECT USING (is_active = true);
CREATE POLICY questions_read ON questions FOR SELECT USING (is_active = true);
CREATE POLICY question_translations_read ON question_translations FOR SELECT USING (true);
CREATE POLICY question_exam_history_read ON question_exam_history FOR SELECT USING (true);
CREATE POLICY test_categories_read ON test_categories FOR SELECT USING (true);
CREATE POLICY tests_read ON tests FOR SELECT USING (is_active = true);
CREATE POLICY test_questions_read ON test_questions FOR SELECT USING (true);
CREATE POLICY subscription_plans_read ON subscription_plans FOR SELECT USING (is_active = true);
CREATE POLICY resources_read ON resources FOR SELECT USING (true);

-- Admin access policies for content management
-- Helper function to avoid RLS recursion
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

CREATE POLICY admin_all_policy ON users FOR ALL USING (
  get_my_role() IN ('admin', 'content_manager')
);

CREATE POLICY admin_exams_all ON exams FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_subjects_all ON subjects FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_exam_subjects_all ON exam_subjects FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_topics_all ON topics FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_questions_all ON questions FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_q_trans_all ON question_translations FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_tests_all ON tests FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_test_questions_all ON test_questions FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_resources_all ON resources FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);
