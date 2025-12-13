-- Migration: Add preferred_language_id to user_preferences table
-- Run this in Supabase SQL Editor

-- Add preferred_language_id column to user_preferences
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS preferred_language_id UUID REFERENCES languages(id);

-- Migrate existing data from users table to user_preferences
UPDATE user_preferences up
SET preferred_language_id = u.preferred_language_id
FROM users u
WHERE up.user_id = u.id AND u.preferred_language_id IS NOT NULL;

-- For users who have a language preference but no user_preferences row yet,
-- create the user_preferences row with their language
INSERT INTO user_preferences (user_id, preferred_language_id)
SELECT u.id, u.preferred_language_id
FROM users u
LEFT JOIN user_preferences up ON u.id = up.user_id
WHERE u.preferred_language_id IS NOT NULL AND up.id IS NULL;

-- =====================================================
-- OPTIONAL: Remove the deprecated column from users table
-- Only run this AFTER verifying the migration worked correctly
-- =====================================================

-- ALTER TABLE users DROP COLUMN IF EXISTS preferred_language_id;

