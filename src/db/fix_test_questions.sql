
-- Fix missing test questions
-- This script ensures valid questions exist and links them to tests

DO $$
DECLARE
    v_topic_id UUID;
    v_lang_id UUID;
    v_question_id UUID;
    v_test_RECORD RECORD;
    v_q_count INTEGER;
BEGIN
    -- 1. Ensure at least one language exists (English)
    SELECT id INTO v_lang_id FROM languages WHERE code = 'en';
    IF v_lang_id IS NULL THEN
        INSERT INTO languages (code, name, native_name, is_active)
        VALUES ('en', 'English', 'English', true)
        RETURNING id INTO v_lang_id;
    END IF;

    -- 2. Ensure at least one topic exists
    SELECT id INTO v_topic_id FROM topics LIMIT 1;
    IF v_topic_id IS NULL THEN
        -- Need a subject first
        INSERT INTO subjects (name, icon, color, description)
        VALUES ('General Knowledge', 'globe', 'blue', 'General awareness questions')
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_topic_id; -- temporarily use subject id references variable
        
        -- Insert topic
        INSERT INTO topics (subject_id, name, description)
        VALUES (v_topic_id, 'General Science', 'Basic science questions')
        RETURNING id INTO v_topic_id;
    END IF;

    -- 3. Ensure we have some questions (Insert 5 generic ones if count < 5)
    SELECT count(*) INTO v_q_count FROM questions;
    
    IF v_q_count < 5 THEN
        FOR i IN 1..5 LOOP
            -- Create Question
            INSERT INTO questions (topic_id, difficulty, correct_answer_index)
            VALUES (v_topic_id, 'medium', 0)
            RETURNING id INTO v_question_id;

            -- Create Translation
            INSERT INTO question_translations (question_id, language_id, question_text, options, explanation)
            VALUES (
                v_question_id, 
                v_lang_id, 
                'Sample Question ' || i || ': What is the capital of France?', 
                '["Paris", "London", "Berlin", "Madrid"]'::jsonb, 
                'Paris is the capital of France.'
            );
        END LOOP;
    END IF;

    -- 4. Link questions to tests
    -- For every test that has < 5 questions, link random questions
    FOR v_test_RECORD IN SELECT * FROM tests LOOP
        SELECT count(*) INTO v_q_count FROM test_questions WHERE test_id = v_test_RECORD.id;
        
        IF v_q_count < 5 THEN
            INSERT INTO test_questions (test_id, question_id, order_index)
            SELECT v_test_RECORD.id, id, (ROW_NUMBER() OVER ())
            FROM questions
            ORDER BY RANDOM()
            LIMIT 5;
            
            RAISE NOTICE 'Linked 5 questions to test: %', v_test_RECORD.title;
        END IF;
    END LOOP;

END $$;
