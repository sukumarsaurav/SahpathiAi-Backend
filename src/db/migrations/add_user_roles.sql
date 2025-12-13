-- Add role column to users table safely
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'admin', 'content_manager'));

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing admin policies if they exist to avoid conflicts/duplicates
DROP POLICY IF EXISTS admin_all_policy ON users;
DROP POLICY IF EXISTS admin_exams_all ON exams;
DROP POLICY IF EXISTS admin_subjects_all ON subjects;
DROP POLICY IF EXISTS admin_exam_subjects_all ON exam_subjects;
DROP POLICY IF EXISTS admin_topics_all ON topics;
DROP POLICY IF EXISTS admin_questions_all ON questions;
DROP POLICY IF EXISTS admin_q_trans_all ON question_translations;
DROP POLICY IF EXISTS admin_tests_all ON tests;
DROP POLICY IF EXISTS admin_test_questions_all ON test_questions;
DROP POLICY IF EXISTS admin_resources_all ON resources;

-- Re-create RLS policies for Admin Access
-- We use public.users explicitly to be safe

-- Users table
CREATE POLICY admin_all_policy ON public.users FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Exams
CREATE POLICY admin_exams_all ON public.exams FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Subjects
CREATE POLICY admin_subjects_all ON public.subjects FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Exam Subjects
CREATE POLICY admin_exam_subjects_all ON public.exam_subjects FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Topics
CREATE POLICY admin_topics_all ON public.topics FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Questions
CREATE POLICY admin_questions_all ON public.questions FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Question Translations
CREATE POLICY admin_q_trans_all ON public.question_translations FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Tests
CREATE POLICY admin_tests_all ON public.tests FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Test Questions
CREATE POLICY admin_test_questions_all ON public.test_questions FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);

-- Resources
CREATE POLICY admin_resources_all ON public.resources FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'content_manager')
);
