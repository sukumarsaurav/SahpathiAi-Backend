-- Migration Script: Normalize Subjects and Topics
-- Run this in Supabase SQL Editor to apply the changes without affecting Users/Auth

-- 1. Drop existing tables (Cascading to remove dependencies)
DROP TABLE IF EXISTS topics CASCADE;
DROP TABLE IF EXISTS exam_subjects CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;

-- 2. Create the new Master Subjects table
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL UNIQUE,
  icon VARCHAR(50),
  color VARCHAR(20),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Recreate Exam Subjects as a Junction Table
CREATE TABLE exam_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, subject_id)
);

-- 4. Recreate Topics with direct link to Subjects + Exam specificity
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE, -- Optional: Specific to an exam
  name VARCHAR(200) NOT NULL,
  description TEXT,
  question_count INT DEFAULT 0,
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Re-enable RLS on these tables
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

-- 6. Re-create RLS Policies (Public Read Access)
CREATE POLICY subjects_read ON subjects FOR SELECT USING (is_active = true);
CREATE POLICY exam_subjects_read ON exam_subjects FOR SELECT USING (is_active = true);
CREATE POLICY topics_read ON topics FOR SELECT USING (is_active = true);

-- 7. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON exam_subjects(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_subject ON exam_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_exam ON topics(exam_id);

-- 8. SEED DATA (Populate the new structure)
-- =====================================================

-- Master Subjects
INSERT INTO subjects (name, icon, color, description) VALUES
('Indian Polity', '🏛️', 'blue', 'Constitution, Governance, Political System'),
('Indian History', '📜', 'orange', 'Ancient, Medieval, Modern History'),
('Geography', '🌍', 'green', 'Physical, Human, Economic Geography'),
('Economy', '📈', 'purple', 'Indian Economy, Economic Concepts'),
('General Science', '🔬', 'red', 'Physics, Chemistry, Biology Basics'),
('Current Affairs', '📰', 'indigo', 'National and International Events'),
('Environment', '🌱', 'emerald', 'Ecology, Biodiversity, Climate'),
('Ethics', '⚖️', 'amber', 'Ethics, Integrity, Aptitude'),
('Physics', '⚛️', 'blue', 'Mechanics, Thermodynamics, Optics, Modern Physics'),
('Chemistry', '🧪', 'green', 'Physical, Organic, Inorganic Chemistry'),
('Biology', '🧬', 'purple', 'Botany and Zoology'),
('Quantitative Aptitude', '🔢', 'blue', 'Mathematics and Numerical Ability'),
('English Language', '📝', 'green', 'Grammar, Vocabulary, Comprehension'),
('General Intelligence', '🧠', 'purple', 'Reasoning and Logical Ability'),
('General Awareness', '🌐', 'orange', 'GK, Current Affairs, Static GK');

-- Link Subjects to Exams
DO $$
DECLARE
  upsc_id UUID;
  neet_id UUID;
  ssc_cgl_id UUID;
  
  polity_id UUID; history_id UUID; geo_id UUID; econ_id UUID; sci_id UUID;
  ca_id UUID; env_id UUID; ethics_id UUID; phy_id UUID; chem_id UUID;
  bio_id UUID; quant_id UUID; eng_id UUID; reasoning_id UUID; ga_id UUID;
BEGIN
  -- Get Exam IDs
  SELECT id INTO upsc_id FROM exams WHERE short_name = 'UPSC';
  SELECT id INTO neet_id FROM exams WHERE short_name = 'NEET';
  SELECT id INTO ssc_cgl_id FROM exams WHERE short_name = 'SSC CGL';
  
  -- Get Subject IDs
  SELECT id INTO polity_id FROM subjects WHERE name = 'Indian Polity';
  SELECT id INTO history_id FROM subjects WHERE name = 'Indian History';
  SELECT id INTO geo_id FROM subjects WHERE name = 'Geography';
  SELECT id INTO econ_id FROM subjects WHERE name = 'Economy';
  SELECT id INTO sci_id FROM subjects WHERE name = 'General Science';
  SELECT id INTO ca_id FROM subjects WHERE name = 'Current Affairs';
  SELECT id INTO env_id FROM subjects WHERE name = 'Environment';
  SELECT id INTO ethics_id FROM subjects WHERE name = 'Ethics';
  SELECT id INTO phy_id FROM subjects WHERE name = 'Physics';
  SELECT id INTO chem_id FROM subjects WHERE name = 'Chemistry';
  SELECT id INTO bio_id FROM subjects WHERE name = 'Biology';
  SELECT id INTO quant_id FROM subjects WHERE name = 'Quantitative Aptitude';
  SELECT id INTO eng_id FROM subjects WHERE name = 'English Language';
  SELECT id INTO reasoning_id FROM subjects WHERE name = 'General Intelligence';
  SELECT id INTO ga_id FROM subjects WHERE name = 'General Awareness';

  -- UPSC
  IF upsc_id IS NOT NULL THEN
    INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES
    (upsc_id, polity_id, 1), (upsc_id, history_id, 2), (upsc_id, geo_id, 3), (upsc_id, econ_id, 4),
    (upsc_id, sci_id, 5), (upsc_id, ca_id, 6), (upsc_id, env_id, 7), (upsc_id, ethics_id, 8);
  END IF;

  -- NEET
  IF neet_id IS NOT NULL THEN
    INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES
    (neet_id, phy_id, 1), (neet_id, chem_id, 2), (neet_id, bio_id, 3);
  END IF;

  -- SSC CGL
  IF ssc_cgl_id IS NOT NULL THEN
    INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES
    (ssc_cgl_id, quant_id, 1), (ssc_cgl_id, eng_id, 2), (ssc_cgl_id, reasoning_id, 3), (ssc_cgl_id, ga_id, 4);
  END IF;

  -- Seed Topics (Common)
  IF polity_id IS NOT NULL THEN
    INSERT INTO topics (subject_id, name, description, order_index) VALUES
    (polity_id, 'Constitution - Historical Background', 'Making of Indian Constitution', 1),
    (polity_id, 'Preamble', 'Preamble to the Constitution', 2),
    (polity_id, 'Fundamental Rights', 'Articles 12-35', 3),
    (polity_id, 'Directive Principles', 'DPSP - Articles 36-51', 4),
    (polity_id, 'Fundamental Duties', 'Article 51A', 5),
    (polity_id, 'Union Government', 'President, PM, Council of Ministers', 6),
    (polity_id, 'Parliament', 'Lok Sabha, Rajya Sabha', 7),
    (polity_id, 'Supreme Court', 'Judiciary - Supreme Court', 8),
    (polity_id, 'State Government', 'Governor, CM, State Legislature', 9),
    (polity_id, 'Local Government', 'Panchayati Raj, Municipalities', 10),
    (polity_id, 'Constitutional Bodies', 'CAG, Election Commission, etc.', 11),
    (polity_id, 'Amendments', 'Important Constitutional Amendments', 12);
  END IF;

  -- Seed Topics (Exam Specific)
  IF history_id IS NOT NULL AND upsc_id IS NOT NULL THEN
      INSERT INTO topics (subject_id, exam_id, name, description, order_index) VALUES
      (history_id, upsc_id, 'World History', 'Events from 18th century (UPSC Mains Specific)', 99);
  END IF;
END $$;
