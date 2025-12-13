-- Sahpathi.ai Seed Data
-- Run this SQL after creating the schema to populate initial data

-- =====================================================
-- LANGUAGES
-- =====================================================

INSERT INTO languages (code, name, native_name, display_order, is_active) VALUES
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
('ur', 'Urdu', 'اردو', 13, true);

-- =====================================================
-- EXAM CATEGORIES
-- =====================================================

INSERT INTO exam_categories (name, description, icon, display_order) VALUES
('Board Exams', 'State and National Board Examinations', 'book', 1),
('Competitive Exams', 'National and State Level Competitive Exams', 'trophy', 2),
('Government Jobs', 'Central and State Government Job Exams', 'briefcase', 3),
('Professional Courses', 'Professional and Entrance Exams', 'graduation-cap', 4);

-- =====================================================
-- EXAMS (From ExamScreen.tsx)
-- =====================================================

-- Get category IDs
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
  INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES
  (board_cat_id, 'Class 10 (All Boards)', 'Class 10', '📚', 'blue', 1),
  (board_cat_id, 'Class 12 (All Boards)', 'Class 12', '📖', 'purple', 2),
  (board_cat_id, 'CBSE', 'CBSE', '🏫', 'green', 3),
  (board_cat_id, 'ICSE', 'ICSE', '🎓', 'orange', 4);

  -- Competitive Exams
  INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES
  (competitive_cat_id, 'UPSC Civil Services', 'UPSC', '🏛️', 'red', 1),
  (competitive_cat_id, 'SSC CGL', 'SSC CGL', '📋', 'blue', 2),
  (competitive_cat_id, 'SSC CHSL', 'SSC CHSL', '📝', 'purple', 3),
  (competitive_cat_id, 'Banking (IBPS/SBI)', 'Banking', '🏦', 'green', 4),
  (competitive_cat_id, 'Railways (RRB)', 'Railways', '🚂', 'orange', 5);

  -- Government Jobs
  INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES
  (govt_cat_id, 'State PSC', 'State PSC', '🏢', 'blue', 1),
  (govt_cat_id, 'Defence (NDA/CDS)', 'Defence', '🎖️', 'green', 2),
  (govt_cat_id, 'Police (SI/Constable)', 'Police', '👮', 'purple', 3),
  (govt_cat_id, 'Teaching (CTET/TET)', 'Teaching', '👨‍🏫', 'orange', 4);

  -- Professional Courses
  INSERT INTO exams (category_id, name, short_name, icon, color, display_order) VALUES
  (professional_cat_id, 'NEET', 'NEET', '⚕️', 'green', 1),
  (professional_cat_id, 'JEE Main', 'JEE Main', '🔧', 'blue', 2),
  (professional_cat_id, 'JEE Advanced', 'JEE Adv', '🚀', 'purple', 3),
  (professional_cat_id, 'GATE', 'GATE', '⚙️', 'orange', 4),
  (professional_cat_id, 'CAT', 'CAT', '📊', 'red', 5),
  (professional_cat_id, 'CLAT', 'CLAT', '⚖️', 'indigo', 6);
END $$;

-- =====================================================
-- SUBSCRIPTION PLANS
-- =====================================================

INSERT INTO subscription_plans (name, price_monthly, price_yearly, features, tests_per_month, is_active) VALUES
('Free', 0, 0, '["5 tests per month", "Basic analytics", "Community support"]', 5, true),
('Pro', 9.99, 99.99, '["Unlimited tests", "Advanced analytics", "Detailed explanations", "Priority support", "Download PDFs"]', NULL, true),
('Pro Plus', 19.99, 199.99, '["Everything in Pro", "1-on-1 tutoring sessions", "Custom study plans", "Interview prep sessions", "Exclusive content", "24/7 premium support"]', NULL, true);

-- =====================================================
-- MASTER SUBJECTS
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
('General Awareness', '🌐', 'orange', 'GK, Current Affairs, Static GK');

-- =====================================================
-- LINK EXAMS TO SUBJECTS
-- =====================================================

DO $$
DECLARE
  upsc_id UUID;
  neet_id UUID;
  ssc_cgl_id UUID;
  
  -- Subject IDs
  polity_id UUID;
  history_id UUID;
  geo_id UUID;
  econ_id UUID;
  sci_id UUID;
  ca_id UUID;
  env_id UUID;
  ethics_id UUID;
  phy_id UUID;
  chem_id UUID;
  bio_id UUID;
  quant_id UUID;
  eng_id UUID;
  reasoning_id UUID;
  ga_id UUID;
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

  -- UPSC Subjects
  IF upsc_id IS NOT NULL THEN
    INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES
    (upsc_id, polity_id, 1),
    (upsc_id, history_id, 2),
    (upsc_id, geo_id, 3),
    (upsc_id, econ_id, 4),
    (upsc_id, sci_id, 5),
    (upsc_id, ca_id, 6),
    (upsc_id, env_id, 7),
    (upsc_id, ethics_id, 8);
  END IF;

  -- NEET Subjects
  IF neet_id IS NOT NULL THEN
    INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES
    (neet_id, phy_id, 1),
    (neet_id, chem_id, 2),
    (neet_id, bio_id, 3);
  END IF;

  -- SSC CGL Subjects
  IF ssc_cgl_id IS NOT NULL THEN
    INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES
    (ssc_cgl_id, quant_id, 1),
    (ssc_cgl_id, eng_id, 2),
    (ssc_cgl_id, reasoning_id, 3),
    (ssc_cgl_id, ga_id, 4);
  END IF;
END $$;


-- =====================================================
-- SAMPLE TOPICS FOR INDIAN POLITY (Common for all exams)
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

  IF polity_id IS NOT NULL THEN
    -- Common Topics (No exam_id)
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

  -- Example of Exam-Specific Topic
  IF history_id IS NOT NULL AND upsc_id IS NOT NULL THEN
      INSERT INTO topics (subject_id, exam_id, name, description, order_index) VALUES
      (history_id, upsc_id, 'World History', 'Events from 18th century (UPSC Mains Specific)', 99);
  END IF;
END $$;

-- =====================================================
-- SAMPLE QUESTIONS (UPSC - Indian Polity)
-- =====================================================

DO $$
DECLARE
  preamble_topic_id UUID;
  fr_topic_id UUID;
  english_lang_id UUID;
  question_id_1 UUID;
  question_id_2 UUID;
  question_id_3 UUID;
BEGIN
  SELECT id INTO preamble_topic_id FROM topics WHERE name = 'Preamble' LIMIT 1;
  SELECT id INTO fr_topic_id FROM topics WHERE name = 'Fundamental Rights' LIMIT 1;
  SELECT id INTO english_lang_id FROM languages WHERE code = 'en';

  -- Question 1
  IF preamble_topic_id IS NOT NULL THEN
    INSERT INTO questions (topic_id, difficulty, correct_answer_index) 
    VALUES (preamble_topic_id, 'medium', 2) RETURNING id INTO question_id_1;

    INSERT INTO question_translations (question_id, language_id, question_text, options, explanation) VALUES
    (question_id_1, english_lang_id, 
     'Which of the following words was added to the Preamble by the 42nd Amendment Act, 1976?',
     '["Democratic", "Republic", "Socialist", "Sovereign"]',
     'The 42nd Amendment Act, 1976 added three new words: Socialist, Secular, and Integrity to the Preamble.');
  END IF;

  -- Question 2
  IF fr_topic_id IS NOT NULL THEN
    INSERT INTO questions (topic_id, difficulty, correct_answer_index) 
    VALUES (fr_topic_id, 'easy', 1) RETURNING id INTO question_id_2;

    INSERT INTO question_translations (question_id, language_id, question_text, options, explanation) VALUES
    (question_id_2, english_lang_id, 
     'Right to Education is enshrined under which Article of the Indian Constitution?',
     '["Article 19", "Article 21A", "Article 32", "Article 14"]',
     'Article 21A was inserted by the 86th Amendment Act, 2002. It makes education a fundamental right for children aged 6-14 years.');
  END IF;

  -- Question 3
  IF preamble_topic_id IS NOT NULL THEN
    INSERT INTO questions (topic_id, difficulty, correct_answer_index) 
    VALUES (preamble_topic_id, 'hard', 3) RETURNING id INTO question_id_3;

    INSERT INTO question_translations (question_id, language_id, question_text, options, explanation) VALUES
    (question_id_3, english_lang_id, 
     'The Preamble to the Indian Constitution was based on which resolution?',
     '["Quit India Resolution", "Lahore Resolution", "Karachi Resolution", "Objectives Resolution"]',
     'The Preamble was based on the Objectives Resolution moved by Jawaharlal Nehru on December 13, 1946 and adopted on January 22, 1947.');
  END IF;
END $$;

-- Update question counts
UPDATE topics SET question_count = (
  SELECT COUNT(*) FROM questions WHERE topic_id = topics.id
);
