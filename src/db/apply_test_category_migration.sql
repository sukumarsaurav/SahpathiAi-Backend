-- Migration: Create Test Categories
-- Run this in Supabase SQL Editor

-- 1. Create Test Categories Table
CREATE TABLE IF NOT EXISTS test_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE, -- For frontend mapping (e.g., 'topic-wise')
  description TEXT,
  icon VARCHAR(50), -- Name of the icon
  color VARCHAR(20), -- Tailwind color class identifier
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE test_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_categories_read ON test_categories FOR SELECT USING (true);

-- 3. Populate Default Categories
INSERT INTO test_categories (name, slug, description, icon, color, display_order) VALUES
('Practice Mistake', 'practice-mistake', 'Retry questions you got wrong', 'alert-circle', 'bg-red-500', 1),
('Topic Wise', 'topic-wise', 'Practice specific topics', 'book-open', 'bg-blue-500', 2),
('Subject Wise', 'subject-wise', 'Complete subject tests', 'target', 'bg-purple-500', 3),
('Full-Length Mock Test', 'full-length', 'Complete mock exams', 'file-text', 'bg-green-500', 4),
('Previous Year', 'previous-year', 'Past exam papers', 'calendar', 'bg-orange-500', 5)
ON CONFLICT (slug) DO NOTHING;

-- 4. Alter Tests Table to reference Test Categories
-- We add the new column, try to map existing data, then drop the old one

-- A. Add new column
ALTER TABLE tests ADD COLUMN IF NOT EXISTS test_category_id UUID REFERENCES test_categories(id);

-- B. Migrate data (Map old string 'category' to new 'test_category_id')
UPDATE tests t
SET test_category_id = tc.id
FROM test_categories tc
WHERE t.category = tc.slug;

-- C. Drop the old category column
ALTER TABLE tests DROP COLUMN IF EXISTS category;
