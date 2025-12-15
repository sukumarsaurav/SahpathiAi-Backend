-- Migration: Add Personalization Tables
-- Purpose: Add concepts, question_concepts, user_concept_stats, user_learning_patterns tables
--          and is_skipped/duration columns to existing answer tables
-- Run this in Supabase SQL Editor

-- =====================================================
-- NEW TABLES: CONCEPTS
-- =====================================================

-- Concepts (smallest learning units)
CREATE TABLE IF NOT EXISTS concepts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  difficulty_level INT DEFAULT 5 CHECK (difficulty_level >= 1 AND difficulty_level <= 10),
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Question Concepts (link questions with concepts)
CREATE TABLE IF NOT EXISTS question_concepts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, concept_id)
);

-- =====================================================
-- NEW TABLES: USER KNOWLEDGE TRACKING
-- =====================================================

-- User Concept Stats (build user knowledge map)
CREATE TABLE IF NOT EXISTS user_concept_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  
  -- Attempt Statistics
  total_attempts INT DEFAULT 0,
  correct_attempts INT DEFAULT 0,
  
  -- Performance Metrics
  accuracy_rate DECIMAL(5, 2) DEFAULT 0,
  avg_time_seconds DECIMAL(10, 2),
  
  -- Proficiency Classification
  proficiency_level VARCHAR(20) DEFAULT 'unknown' 
    CHECK (proficiency_level IN ('unknown', 'weak', 'developing', 'medium', 'strong', 'mastered')),
  confidence_score DECIMAL(5, 2) DEFAULT 0,
  
  -- Temporal Tracking
  last_practiced TIMESTAMPTZ,
  next_review_date DATE,
  
  -- Trend Analysis
  recent_trend VARCHAR(20) DEFAULT 'stable'
    CHECK (recent_trend IN ('declining', 'stable', 'improving')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, concept_id)
);

-- User Learning Patterns (track overall study behavior)
CREATE TABLE IF NOT EXISTS user_learning_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Study Time Patterns
  preferred_study_hours JSONB,
  avg_session_duration_minutes INT DEFAULT 0,
  avg_questions_per_session INT DEFAULT 0,
  
  -- Performance Patterns
  peak_performance_hour INT,
  optimal_difficulty VARCHAR(20) DEFAULT 'medium',
  fatigue_threshold_minutes INT,
  
  -- Behavior Patterns
  preferred_question_pace VARCHAR(20) DEFAULT 'normal'
    CHECK (preferred_question_pace IN ('slow', 'normal', 'fast')),
  skip_tendency DECIMAL(5, 2) DEFAULT 0,
  review_tendency DECIMAL(5, 2) DEFAULT 0,
  
  -- Consistency Metrics
  weekly_practice_days INT DEFAULT 0,
  consistency_score DECIMAL(5, 2) DEFAULT 0,
  
  -- Strength/Weakness Summary
  strongest_subject_ids JSONB,
  weakest_subject_ids JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MODIFY EXISTING TABLES: ADD is_skipped & duration
-- =====================================================

-- Add columns to user_answers
ALTER TABLE user_answers 
ADD COLUMN IF NOT EXISTS duration_seconds DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN DEFAULT false;

-- Add is_skipped to custom_test_questions
ALTER TABLE custom_test_questions 
ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN DEFAULT false;

-- Add is_skipped to marathon_answers
ALTER TABLE marathon_answers 
ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN DEFAULT false;

-- Add is_skipped to daily_practice_questions
ALTER TABLE daily_practice_questions 
ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN DEFAULT false;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Concept indexes
CREATE INDEX IF NOT EXISTS idx_concepts_topic ON concepts(topic_id);
CREATE INDEX IF NOT EXISTS idx_question_concepts_question ON question_concepts(question_id);
CREATE INDEX IF NOT EXISTS idx_question_concepts_concept ON question_concepts(concept_id);

-- User concept stats indexes (critical for personalization)
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_user ON user_concept_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_concept ON user_concept_stats(concept_id);
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_proficiency ON user_concept_stats(user_id, proficiency_level);
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_next_review ON user_concept_stats(user_id, next_review_date);

-- Learning patterns index
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_user ON user_learning_patterns(user_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_concept_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning_patterns ENABLE ROW LEVEL SECURITY;

-- Public read access for concept content tables
CREATE POLICY concepts_read ON concepts FOR SELECT USING (is_active = true);
CREATE POLICY question_concepts_read ON question_concepts FOR SELECT USING (true);

-- User-specific policies for concept stats and learning patterns
CREATE POLICY user_concept_stats_policy ON user_concept_stats FOR ALL USING (auth.uid() = user_id);
CREATE POLICY user_learning_patterns_policy ON user_learning_patterns FOR ALL USING (auth.uid() = user_id);

-- Admin write access for content tables
CREATE POLICY admin_concepts_all ON concepts FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_question_concepts_all ON question_concepts FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);
