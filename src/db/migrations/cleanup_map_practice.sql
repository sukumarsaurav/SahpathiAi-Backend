-- Cleanup Migration: Remove failed map_practice migration artifacts
-- Run this FIRST if the initial add_map_practice.sql migration partially failed
-- Then run the fixed add_map_practice.sql

-- =====================================================
-- 1. DROP TABLES (in reverse dependency order)
-- =====================================================

DROP TABLE IF EXISTS map_practice_answers CASCADE;
DROP TABLE IF EXISTS map_practice_sessions CASCADE;
DROP TABLE IF EXISTS map_locations CASCADE;

-- =====================================================
-- 2. DROP FUNCTION (trigger is automatically dropped with table)
-- =====================================================

DROP FUNCTION IF EXISTS calculate_location_difficulty() CASCADE;

-- =====================================================
-- 3. DROP ADDED COLUMNS FROM QUESTIONS TABLE
-- =====================================================

ALTER TABLE questions DROP COLUMN IF EXISTS question_type;
ALTER TABLE questions DROP COLUMN IF EXISTS map_data;
ALTER TABLE questions DROP COLUMN IF EXISTS blank_data;

-- =====================================================
-- 4. DROP INDEXES (if they exist)
-- =====================================================

DROP INDEX IF EXISTS idx_map_locations_type;
DROP INDEX IF EXISTS idx_map_locations_parent;
DROP INDEX IF EXISTS idx_map_locations_state;
DROP INDEX IF EXISTS idx_map_locations_district;
DROP INDEX IF EXISTS idx_map_locations_geojson;
DROP INDEX IF EXISTS idx_map_locations_difficulty;
DROP INDEX IF EXISTS idx_map_locations_name;
DROP INDEX IF EXISTS idx_map_locations_search;
DROP INDEX IF EXISTS idx_questions_type;
DROP INDEX IF EXISTS idx_questions_map;

-- =====================================================
-- 5. SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Cleanup complete! You can now run add_map_practice.sql';
END $$;
