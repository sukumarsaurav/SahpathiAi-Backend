-- Sahpathi.ai Database Schema (Consolidated)
-- This file contains the complete database structure including all migrations.
-- Run this SQL in Supabase SQL Editor to create all tables from scratch.
-- Last updated: 2024-12-16

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
  -- AI Question Generation fields
  is_ai_generated BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT true, -- AI questions start unverified, manual questions are verified
  content_hash VARCHAR(64), -- SHA-256 for duplicate detection
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

-- =====================================================
-- CONCEPT TABLES (for personalized learning)
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
  price_monthly DECIMAL(10, 2) DEFAULT 0, -- Price for 1-month (legacy: price_monthly)
  price_3_months DECIMAL(10, 2) DEFAULT 0, -- Price for 3-month duration
  price_6_months DECIMAL(10, 2) DEFAULT 0, -- Price for 6-month duration
  price_yearly DECIMAL(10, 2) DEFAULT 0, -- Price for 12-month (legacy: price_yearly)
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
  duration_type VARCHAR(20) DEFAULT '1_month' CHECK (duration_type IN ('1_month', '3_months', '6_months', '1_year')),
  is_recurring BOOLEAN DEFAULT FALSE, -- One-time by default, true for auto-renewal
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- =====================================================
-- PROMO CODE TABLES
-- =====================================================

-- Promo Codes
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  discount_type VARCHAR(20) DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
  max_uses INT, -- NULL = unlimited
  current_uses INT DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  applicable_plan_ids JSONB, -- NULL = all plans, or array of plan IDs
  min_order_amount DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Orders (tracks Razorpay payment attempts)
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  razorpay_order_id VARCHAR(100) UNIQUE,
  plan_id UUID REFERENCES subscription_plans(id),
  billing_cycle VARCHAR(20) CHECK (billing_cycle IN ('monthly', 'yearly')), -- Legacy, kept for compatibility
  duration VARCHAR(20) DEFAULT '1_month' CHECK (duration IN ('1_month', '3_months', '6_months', '1_year')),
  is_recurring BOOLEAN DEFAULT FALSE,
  amount DECIMAL(10, 2) NOT NULL,
  original_amount DECIMAL(10, 2),
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  promo_code_id UUID REFERENCES promo_codes(id),
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired')),
  razorpay_payment_id VARCHAR(100),
  razorpay_signature VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- Promo Code Usage tracking
CREATE TABLE IF NOT EXISTS promo_code_usages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_code_id UUID REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  payment_order_id UUID REFERENCES payment_orders(id) ON DELETE SET NULL,
  discount_amount DECIMAL(10, 2) NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(promo_code_id, user_id) -- Prevent same user using same code twice
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
  duration_seconds DECIMAL(10, 2),
  is_skipped BOOLEAN DEFAULT false,
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

-- User Mistakes (NOT from Marathon mode) - Enhanced with mastery tracking
CREATE TABLE IF NOT EXISTS user_mistakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  selected_option INT,
  retry_count INT DEFAULT 0,
  is_resolved BOOLEAN DEFAULT false,
  -- Mastery tracking fields
  consecutive_correct INT DEFAULT 0,
  total_correct INT DEFAULT 0,
  mastery_status TEXT DEFAULT 'not_started' CHECK (mastery_status IN ('not_started', 'practicing', 'mastered')),
  next_review_date DATE,
  difficulty TEXT,
  last_correct_at TIMESTAMPTZ,
  time_taken_avg INT DEFAULT 0,
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
  is_skipped BOOLEAN DEFAULT false,
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
  last_question_id UUID REFERENCES questions(id), -- Tracks last shown question to prevent consecutive repeats
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
  is_skipped BOOLEAN DEFAULT false,
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
  is_skipped BOOLEAN DEFAULT false,
  answered_at TIMESTAMPTZ
);

-- =====================================================
-- USER KNOWLEDGE TRACKING TABLES
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
-- SUPPORT SYSTEM TABLES
-- =====================================================

-- Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  issue_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Support Messages (Chat-like interaction)
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_from_admin BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ADMIN SETTINGS TABLE
-- =====================================================

-- Admin Settings (API keys, configuration)
CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- =====================================================
-- USER ANALYTICS TABLES
-- =====================================================

-- User Sessions (Device & Location Tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  device_type VARCHAR(20) CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'unknown')),
  os VARCHAR(50),
  os_version VARCHAR(20),
  browser VARCHAR(50),
  browser_version VARCHAR(20),
  ip_address INET,
  country VARCHAR(100),
  country_code VARCHAR(2),
  region VARCHAR(100),
  city VARCHAR(100),
  timezone VARCHAR(50),
  user_agent TEXT,
  is_mobile BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MARKETING & SOCIAL MEDIA TABLES
-- =====================================================

-- Marketing Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  utm_source VARCHAR(50),
  utm_medium VARCHAR(50),
  utm_campaign VARCHAR(100),
  utm_content VARCHAR(100),
  utm_term VARCHAR(100),
  start_date DATE,
  end_date DATE,
  budget DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  target_signups INTEGER,
  target_conversions INTEGER,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign Expenses
CREATE TABLE IF NOT EXISTS campaign_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  category VARCHAR(50),
  description TEXT,
  platform VARCHAR(50),
  invoice_reference VARCHAR(100),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Referral Sources
CREATE TABLE IF NOT EXISTS user_referral_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  utm_source VARCHAR(50),
  utm_medium VARCHAR(50),
  utm_campaign VARCHAR(100),
  utm_content VARCHAR(100),
  utm_term VARCHAR(100),
  referrer_url TEXT,
  landing_page TEXT,
  campaign_id UUID REFERENCES marketing_campaigns(id),
  device_type VARCHAR(20),
  country VARCHAR(100),
  converted_to_paid BOOLEAN DEFAULT false,
  conversion_date TIMESTAMPTZ,
  conversion_value DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website Visitors (Anonymous Visitor Tracking for Marketing Funnel)
CREATE TABLE IF NOT EXISTS website_visitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Visitor Identification (cookie-based)
  visitor_id VARCHAR(100) NOT NULL,
  
  -- UTM Parameters (captured on first visit)
  utm_source VARCHAR(50),
  utm_medium VARCHAR(50),
  utm_campaign VARCHAR(100),
  utm_content VARCHAR(100),
  utm_term VARCHAR(100),
  
  -- Additional Context
  referrer_url TEXT,
  landing_page TEXT,
  
  -- Device/Location Info
  device_type VARCHAR(20),  -- mobile, desktop, tablet
  country VARCHAR(100),
  country_code VARCHAR(10),
  
  -- Conversion Tracking
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Linked when visitor signs up
  converted_to_signup BOOLEAN DEFAULT false,
  signup_date TIMESTAMPTZ,
  
  -- Visit Tracking
  visit_count INTEGER DEFAULT 1,
  first_visit_at TIMESTAMPTZ DEFAULT NOW(),
  last_visit_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social Accounts
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('facebook', 'instagram', 'whatsapp')),
  account_name VARCHAR(100),
  account_id VARCHAR(100),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  page_id VARCHAR(100),
  instagram_account_id VARCHAR(100),
  whatsapp_business_id VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  connected_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social Posts
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200),
  content TEXT NOT NULL,
  media_urls TEXT[],
  link_url TEXT,
  call_to_action VARCHAR(50),
  platforms TEXT[] NOT NULL,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'deleted')),
  campaign_id UUID REFERENCES marketing_campaigns(id),
  platform_post_ids JSONB,
  error_message TEXT,
  engagement_data JSONB,
  reach INTEGER,
  impressions INTEGER,
  clicks INTEGER,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Content tables indexes
CREATE INDEX IF NOT EXISTS idx_exams_category ON exams(category_id);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON exam_subjects(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_subject ON exam_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_exam ON topics(exam_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_questions_ai_status ON questions(is_ai_generated, is_verified);
CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON questions(content_hash);
CREATE INDEX IF NOT EXISTS idx_question_translations_question ON question_translations(question_id);
CREATE INDEX IF NOT EXISTS idx_question_exam_history_question ON question_exam_history(question_id);

-- Test tables indexes
CREATE INDEX IF NOT EXISTS idx_test_attempts_user ON test_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_test ON test_attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_date ON test_attempts(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_answers_attempt ON user_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_question ON user_answers(question_id);

-- User interaction indexes
CREATE INDEX IF NOT EXISTS idx_saved_questions_user ON saved_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mistakes_user ON user_mistakes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mistakes_mastery ON user_mistakes(user_id, mastery_status);
CREATE INDEX IF NOT EXISTS idx_user_mistakes_retry_level ON user_mistakes(user_id, retry_count);
CREATE INDEX IF NOT EXISTS idx_user_mistakes_review_date ON user_mistakes(user_id, next_review_date) WHERE next_review_date IS NOT NULL;

-- Custom test indexes
CREATE INDEX IF NOT EXISTS idx_custom_tests_user ON custom_tests(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_test_questions_test ON custom_test_questions(custom_test_id);
CREATE INDEX IF NOT EXISTS idx_custom_test_questions_order ON custom_test_questions(custom_test_id, order_index);

-- Marathon mode indexes
CREATE INDEX IF NOT EXISTS idx_marathon_sessions_user ON marathon_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_marathon_queue_session ON marathon_question_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_marathon_queue_session_priority ON marathon_question_queue(session_id, priority);
CREATE INDEX IF NOT EXISTS idx_marathon_answers_session ON marathon_answers(session_id);

-- Daily practice indexes
CREATE INDEX IF NOT EXISTS idx_daily_sessions_user ON daily_practice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_questions_session ON daily_practice_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_daily_questions_order ON daily_practice_questions(session_id, order_index);
CREATE INDEX IF NOT EXISTS idx_daily_progress_user_date ON daily_progress(user_id, practice_date);

-- Payment/wallet indexes
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_razorpay_id ON payment_orders(razorpay_order_id);

-- Promo code indexes
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_promo_code_usages_user ON promo_code_usages(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_usages_promo ON promo_code_usages(promo_code_id);

-- Concept indexes
CREATE INDEX IF NOT EXISTS idx_concepts_topic ON concepts(topic_id);
CREATE INDEX IF NOT EXISTS idx_question_concepts_question ON question_concepts(question_id);
CREATE INDEX IF NOT EXISTS idx_question_concepts_concept ON question_concepts(concept_id);

-- User concept stats indexes (critical for personalization)
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_user ON user_concept_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_concept ON user_concept_stats(concept_id);
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_user_concept ON user_concept_stats(user_id, concept_id);
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_proficiency ON user_concept_stats(user_id, proficiency_level);
CREATE INDEX IF NOT EXISTS idx_user_concept_stats_next_review ON user_concept_stats(user_id, next_review_date);

-- Learning patterns index
CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_user ON user_learning_patterns(user_id);

-- Support system indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_number ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created ON support_messages(ticket_id, created_at);

-- Website visitors indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_visitor_id ON website_visitors(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitors_utm_source ON website_visitors(utm_source);
CREATE INDEX IF NOT EXISTS idx_visitors_utm_campaign ON website_visitors(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_visitors_converted ON website_visitors(converted_to_signup);
CREATE INDEX IF NOT EXISTS idx_visitors_user ON website_visitors(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visitors_first_visit ON website_visitors(first_visit_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_created ON website_visitors(created_at DESC);

-- =====================================================
-- PARTIAL INDEXES (Status-based queries optimization)
-- =====================================================

-- Active marathon sessions only
CREATE INDEX IF NOT EXISTS idx_marathon_sessions_active ON marathon_sessions(user_id) 
WHERE status = 'active';

-- Unresolved mistakes only
CREATE INDEX IF NOT EXISTS idx_user_mistakes_unresolved ON user_mistakes(user_id) 
WHERE is_resolved = false;

-- Active daily practice sessions
CREATE INDEX IF NOT EXISTS idx_daily_sessions_active ON daily_practice_sessions(user_id) 
WHERE status = 'active';

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on ALL tables

-- User tables
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
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

-- Content tables (PUBLIC READ)
ALTER TABLE exam_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_exam_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Concept and learning tables
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_concept_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning_patterns ENABLE ROW LEVEL SECURITY;

-- Support tables
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Promo code tables
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_usages ENABLE ROW LEVEL SECURITY;

-- Admin settings
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Marketing/analytics tables (admin access only)
ALTER TABLE website_visitors ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES - USER DATA (Users can only access their own data)
-- =====================================================

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
CREATE POLICY payment_orders_policy ON payment_orders FOR ALL USING (auth.uid() = user_id);

-- User-specific policies for concept stats and learning patterns
CREATE POLICY user_concept_stats_policy ON user_concept_stats FOR ALL USING (auth.uid() = user_id);
CREATE POLICY user_learning_patterns_policy ON user_learning_patterns FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- RLS POLICIES - PUBLIC READ ACCESS (Content tables)
-- =====================================================

CREATE POLICY exam_categories_read ON exam_categories FOR SELECT USING (true);
CREATE POLICY exams_read ON exams FOR SELECT USING (is_active = true);
CREATE POLICY subjects_read ON subjects FOR SELECT USING (is_active = true);
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

-- Public read access for concept content tables
CREATE POLICY concepts_read ON concepts FOR SELECT USING (is_active = true);
CREATE POLICY question_concepts_read ON question_concepts FOR SELECT USING (true);

-- Public read access for active promo codes (for validation)
CREATE POLICY promo_codes_read ON promo_codes FOR SELECT USING (is_active = true);

-- Users can only see their own promo code usages
CREATE POLICY promo_code_usages_policy ON promo_code_usages FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- RLS POLICIES - SUPPORT SYSTEM
-- =====================================================

-- Users can view and create their own tickets
CREATE POLICY support_tickets_user_policy ON support_tickets 
  FOR ALL USING (auth.uid() = user_id);

-- Users can view and create messages on their own tickets
CREATE POLICY support_messages_user_policy ON support_messages 
  FOR ALL USING (
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
  );

-- =====================================================
-- RLS HELPER FUNCTION (Avoid recursion)
-- =====================================================

-- Secure function to fetch the current user's role without triggering RLS
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- =====================================================
-- RLS POLICIES - ADMIN ACCESS
-- =====================================================

-- Users table admin access (using secure function to avoid recursion)
CREATE POLICY admin_all_policy ON users FOR ALL USING (
  get_my_role() IN ('admin', 'content_manager')
);

-- Content tables admin access
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

CREATE POLICY admin_concepts_all ON concepts FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY admin_question_concepts_all ON question_concepts FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Support system admin access
CREATE POLICY support_tickets_admin_policy ON support_tickets 
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

CREATE POLICY support_messages_admin_policy ON support_messages 
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- Promo codes admin access
CREATE POLICY promo_codes_admin_all ON promo_codes FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

CREATE POLICY promo_code_usages_admin ON promo_code_usages FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Admin settings policy (only admins)
CREATE POLICY admin_settings_policy ON admin_settings 
FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

-- Website visitors policy (admin and content managers can view)
CREATE POLICY website_visitors_admin ON website_visitors 
FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to handle new user signup
-- Automatically inserts a row into public.users when a new user is created in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Trigger to call the function on every new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generate Support Ticket Number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
DECLARE
  ticket_num TEXT;
  counter INT;
BEGIN
  -- Get count of tickets today
  SELECT COUNT(*) + 1 INTO counter 
  FROM support_tickets 
  WHERE DATE(created_at) = CURRENT_DATE;
  
  -- Format: TKT-YYYYMMDD-XXXX
  ticket_num := 'TKT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
  
  RETURN ticket_num;
END;
$$ LANGUAGE plpgsql;

-- Generate Question Content Hash (for AI duplicate detection)
CREATE OR REPLACE FUNCTION generate_question_hash(question_text TEXT)
RETURNS VARCHAR(64)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Normalize: lowercase, trim whitespace, remove extra spaces
  RETURN encode(
    sha256(
      regexp_replace(
        lower(trim(question_text)), 
        '\s+', ' ', 'g'
      )::bytea
    ), 
    'hex'
  );
END;
$$;

-- Increment Promo Code Usage Count
CREATE OR REPLACE FUNCTION increment_promo_uses(promo_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE promo_codes
  SET current_uses = current_uses + 1,
      updated_at = NOW()
  WHERE id = promo_id;
END;
$$;

-- =====================================================
-- END OF SCHEMA
-- =====================================================
