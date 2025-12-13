-- Safe Seed Data Script
-- Run this in Supabase SQL Editor to populate reference data safely.
-- It checks for existing records to avoid duplicates.

-- =====================================================
-- 1. LANGUAGES
-- =====================================================
INSERT INTO languages (code, name, native_name, display_order, is_active)
VALUES
('en', 'English', 'English', 1, true),
('hi', 'Hindi', 'हिंदी', 2, true),
('te', 'Telugu', 'తెలుగు', 3, true),
('ta', 'Tamil', 'தமிழ்', 4, true),
('kn', 'Kannada', 'ಕನ್ನಡ', 5, true),
('ml', 'Malayalam', 'മലയാളം', 6, true),
('mr', 'Marathi', 'मराठी', 7, true),
('bn', 'Bengali', 'বাংলা', 8, true),
('gu', 'Gujarati', 'ગુજરાતી', 9, true),
('pa', 'Punjabi', 'ਪੰਜਾਬੀ', 10, true),
('or', 'Odia', 'ଓଡ଼ିଆ', 11, true),
('as', 'Assamese', 'অসমীয়া', 12, true),
('ur', 'Urdu', 'اردو', 13, true)
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, native_name = EXCLUDED.native_name;

-- =====================================================
-- 2. EXAM CATEGORIES
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM exam_categories WHERE name = 'Board Exams') THEN
        INSERT INTO exam_categories (name, description, icon, display_order) VALUES ('Board Exams', 'State and National Board Examinations', 'book', 1);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM exam_categories WHERE name = 'Competitive Exams') THEN
        INSERT INTO exam_categories (name, description, icon, display_order) VALUES ('Competitive Exams', 'National and State Level Competitive Exams', 'trophy', 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM exam_categories WHERE name = 'Government Jobs') THEN
        INSERT INTO exam_categories (name, description, icon, display_order) VALUES ('Government Jobs', 'Central and State Government Job Exams', 'briefcase', 3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM exam_categories WHERE name = 'Professional Courses') THEN
        INSERT INTO exam_categories (name, description, icon, display_order) VALUES ('Professional Courses', 'Professional and Entrance Exams', 'graduation-cap', 4);
    END IF;
END $$;

-- =====================================================
-- 3. EXAMS
-- =====================================================
DO $$
DECLARE
  board_cat_id UUID;
  competitive_cat_id UUID;
  govt_cat_id UUID;
  professional_cat_id UUID;
BEGIN
  SELECT id INTO board_cat_id FROM exam_categories WHERE name = 'Board Exams';
  SELECT id INTO competitive_cat_id FROM exam_categories WHERE name = 'Competitive Exams';
  SELECT id INTO govt_cat_id FROM exam_categories WHERE name = 'Government Jobs';
  SELECT id INTO professional_cat_id FROM exam_categories WHERE name = 'Professional Courses';

  -- Board Exams
  IF NOT EXISTS (SELECT 1 FROM exams WHERE name = 'Class 10 (All Boards)') THEN
     INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES (board_cat_id, 'Class 10 (All Boards)', 'Class 10', '📚', 'blue', 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM exams WHERE name = 'Class 12 (All Boards)') THEN
     INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES (board_cat_id, 'Class 12 (All Boards)', 'Class 12', '📖', 'purple', 2);
  END IF;

  -- Competitive
  IF NOT EXISTS (SELECT 1 FROM exams WHERE short_name = 'UPSC') THEN
     INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES (competitive_cat_id, 'UPSC Civil Services', 'UPSC', '🏛️', 'red', 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM exams WHERE short_name = 'SSC CGL') THEN
     INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES (competitive_cat_id, 'SSC CGL', 'SSC CGL', '📋', 'blue', 2);
  END IF;

  -- Professional
  IF NOT EXISTS (SELECT 1 FROM exams WHERE short_name = 'NEET') THEN
     INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES (professional_cat_id, 'NEET', 'NEET', '⚕️', 'green', 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM exams WHERE short_name = 'JEE Main') THEN
     INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES (professional_cat_id, 'JEE Main', 'JEE Main', '🔧', 'blue', 2);
  END IF;
END $$;

-- =====================================================
-- 4. MASTER SUBJECTS (Normalized)
-- =====================================================
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
('General Awareness', '🌐', 'orange', 'GK, Current Affairs, Static GK')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 5. LINK EXAMS TO SUBJECTS (Junction)
-- =====================================================
DO $$
DECLARE
  upsc_id UUID; neet_id UUID; ssc_cgl_id UUID;
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
    (upsc_id, polity_id, 1), (upsc_id, history_id, 2), (upsc_id, geo_id, 3), 
    (upsc_id, econ_id, 4), (upsc_id, sci_id, 5), (upsc_id, ca_id, 6), 
    (upsc_id, env_id, 7), (upsc_id, ethics_id, 8)
    ON CONFLICT (exam_id, subject_id) DO NOTHING;
  END IF;

  -- NEET
  IF neet_id IS NOT NULL THEN
    INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES
    (neet_id, phy_id, 1), (neet_id, chem_id, 2), (neet_id, bio_id, 3)
    ON CONFLICT (exam_id, subject_id) DO NOTHING;
  END IF;

  -- SSC CGL
  IF ssc_cgl_id IS NOT NULL THEN
    INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES
    (ssc_cgl_id, quant_id, 1), (ssc_cgl_id, eng_id, 2), (ssc_cgl_id, reasoning_id, 3), (ssc_cgl_id, ga_id, 4)
    ON CONFLICT (exam_id, subject_id) DO NOTHING;
  END IF;
END $$;

-- =====================================================
-- 6. TOPICS (Safe Insert)
-- =====================================================
DO $$
DECLARE
  polity_id UUID;
  history_id UUID;
  upsc_id UUID;
BEGIN
  SELECT id INTO polity_id FROM subjects WHERE name = 'Indian Polity' LIMIT 1;
  SELECT id INTO history_id FROM subjects WHERE name = 'Indian History' LIMIT 1;
  SELECT id INTO upsc_id FROM exams WHERE short_name = 'UPSC' LIMIT 1;

  -- Common Topics for Indian Polity
  IF polity_id IS NOT NULL THEN
    -- Check if Preamble exists for this subject to avoid duplication
    IF NOT EXISTS (SELECT 1 FROM topics WHERE subject_id = polity_id AND name = 'Preamble') THEN
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
  END IF;

  -- Exam Specific Topic
  IF history_id IS NOT NULL AND upsc_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM topics WHERE subject_id = history_id AND exam_id = upsc_id AND name = 'World History') THEN
      INSERT INTO topics (subject_id, exam_id, name, description, order_index) VALUES
      (history_id, upsc_id, 'World History', 'Events from 18th century (UPSC Mains Specific)', 99);
    END IF;
  END IF;
END $$;
