import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * POST /api/custom-test/generate
 * Generate custom test with selected options
 */
router.post('/generate', authenticate, async (req, res) => {
    try {
        const { subjectId, topicIds, totalQuestions, durationMinutes } = req.body;

        // Get random questions from selected topics
        const { data: questions, error } = await supabaseAdmin
            .from('questions')
            .select('id')
            .in('topic_id', topicIds)
            .eq('is_active', true)
            .limit(totalQuestions);

        if (error) throw error;

        if (!questions || questions.length === 0) {
            return res.status(400).json({ error: 'No questions found for selected topics' });
        }

        // Shuffle and limit questions
        const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, totalQuestions);

        // Create custom test
        const { data: test, error: testError } = await supabaseAdmin
            .from('custom_tests')
            .insert({
                user_id: req.user!.id,
                exam_subject_id: subjectId,
                selected_topic_ids: topicIds,
                total_questions: shuffled.length,
                duration_minutes: durationMinutes,
                status: 'generated'
            })
            .select()
            .single();

        if (testError) throw testError;

        // Add questions to test
        const testQuestions = shuffled.map((q, i) => ({
            custom_test_id: test.id,
            question_id: q.id,
            order_index: i
        }));

        await supabaseAdmin.from('custom_test_questions').insert(testQuestions);

        // Get topic names
        const { data: topics } = await supabaseAdmin
            .from('topics')
            .select('name')
            .in('id', topicIds);

        res.status(201).json({
            testId: test.id,
            totalQuestions: shuffled.length,
            durationMinutes,
            topics: topics?.map(t => t.name) || []
        });
    } catch (error) {
        console.error('Generate test error:', error);
        res.status(500).json({ error: 'Failed to generate test' });
    }
});

/**
 * GET /api/custom-test/history
 * Get user's custom test history
 */
router.get('/history', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('custom_tests')
            .select('*')
            .eq('user_id', req.user!.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

/**
 * GET /api/custom-test/:testId
 * Get generated custom test questions
 */
router.get('/:testId', authenticate, async (req, res) => {
    try {
        const { testId } = req.params;
        const languageId = req.user?.preferred_language_id;

        // Get test details
        const { data: test, error } = await supabaseAdmin
            .from('custom_tests')
            .select('*')
            .eq('id', testId)
            .eq('user_id', req.user!.id)
            .single();

        if (error) throw error;
        if (!test) {
            return res.status(404).json({ error: 'Test not found' });
        }

        // Get questions
        const { data: testQuestions } = await supabaseAdmin
            .from('custom_test_questions')
            .select(`
        *,
        question:questions(
          *,
          translations:question_translations(*, language:languages(*))
        )
      `)
            .eq('custom_test_id', testId)
            .order('order_index');

        // Format questions with translations
        const questions = testQuestions?.map(tq => {
            const q = tq.question as any;
            const translation = languageId
                ? q.translations.find((t: any) => t.language_id === languageId)
                : q.translations[0];

            return {
                id: tq.id,
                question_id: q.id,
                order: tq.order_index + 1,
                question: translation?.question_text,
                options: translation?.options,
                difficulty: q.difficulty,
                translations: q.translations
            };
        });

        res.json({ ...test, questions });
    } catch (error) {
        console.error('Get test error:', error);
        res.status(500).json({ error: 'Failed to fetch test' });
    }
});

/**
 * POST /api/custom-test/:testId/start
 * Start taking the custom test
 */
router.post('/:testId/start', authenticate, async (req, res) => {
    try {
        const { testId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('custom_tests')
            .update({
                status: 'in_progress',
                started_at: new Date().toISOString()
            })
            .eq('id', testId)
            .eq('user_id', req.user!.id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Start test error:', error);
        res.status(500).json({ error: 'Failed to start test' });
    }
});

/**
 * POST /api/custom-test/:testId/submit
 * Submit custom test answers
 */
router.post('/:testId/submit', authenticate, async (req, res) => {
    try {
        const { testId } = req.params;
        const { answers } = req.body;

        let score = 0;

        // Update each question answer
        for (const answer of answers) {
            const { data: testQuestion } = await supabaseAdmin
                .from('custom_test_questions')
                .select('question_id')
                .eq('id', answer.question_item_id)
                .single();

            const { data: question } = await supabaseAdmin
                .from('questions')
                .select('correct_answer_index')
                .eq('id', testQuestion?.question_id)
                .single();

            const isSkipped = answer.selected_option === null;
            const isCorrect = !isSkipped && question?.correct_answer_index === answer.selected_option;
            if (isCorrect) score++;

            await supabaseAdmin
                .from('custom_test_questions')
                .update({
                    selected_option: answer.selected_option,
                    is_correct: isCorrect,
                    is_skipped: isSkipped,
                    time_taken_seconds: answer.time_taken || 0,
                    answered_at: new Date().toISOString()
                })
                .eq('id', answer.question_item_id);

            // Track mistake if wrong (Custom tests DO count as mistakes)
            if (!isCorrect) {
                const { data: existing } = await supabaseAdmin
                    .from('user_mistakes')
                    .select('id, retry_count')
                    .eq('user_id', req.user!.id)
                    .eq('question_id', testQuestion?.question_id)
                    .single();

                if (existing) {
                    await supabaseAdmin
                        .from('user_mistakes')
                        .update({
                            retry_count: existing.retry_count + 1,
                            is_resolved: false,
                            last_attempted: new Date().toISOString()
                        })
                        .eq('id', existing.id);
                } else {
                    await supabaseAdmin.from('user_mistakes').insert({
                        user_id: req.user!.id,
                        question_id: testQuestion?.question_id,
                        selected_option: answer.selected_option
                    });
                }
            }
        }

        // Update test status
        const { data: test, error } = await supabaseAdmin
            .from('custom_tests')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('id', testId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            testId,
            score,
            totalQuestions: answers.length,
            percentage: Math.round((score / answers.length) * 100)
        });
    } catch (error) {
        console.error('Submit test error:', error);
        res.status(500).json({ error: 'Failed to submit test' });
    }
});

/**
 * GET /api/custom-test/:testId/result
 * Get custom test result
 */
router.get('/:testId/result', authenticate, async (req, res) => {
    try {
        const { testId } = req.params;
        const languageId = req.user?.preferred_language_id;

        // Get test details
        const { data: test } = await supabaseAdmin
            .from('custom_tests')
            .select('*')
            .eq('id', testId)
            .eq('user_id', req.user!.id)
            .single();

        // Get questions with answers
        const { data: questions } = await supabaseAdmin
            .from('custom_test_questions')
            .select(`
        *,
        question:questions(
          *,
          translations:question_translations(*)
        )
      `)
            .eq('custom_test_id', testId)
            .order('order_index');

        // Calculate score
        const correct = questions?.filter(q => q.is_correct).length || 0;
        const total = questions?.length || 0;

        // Format questions with translations
        const formattedQuestions = questions?.map(tq => {
            const q = tq.question as any;
            const translation = languageId
                ? q.translations.find((t: any) => t.language_id === languageId)
                : q.translations[0];

            return {
                question: translation?.question_text,
                options: translation?.options,
                explanation: translation?.explanation,
                selected_option: tq.selected_option,
                correct_answer: q.correct_answer_index,
                is_correct: tq.is_correct,
                time_taken: tq.time_taken_seconds
            };
        });

        res.json({
            ...test,
            score: correct,
            totalQuestions: total,
            percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
            questions: formattedQuestions
        });
    } catch (error) {
        console.error('Get result error:', error);
        res.status(500).json({ error: 'Failed to fetch result' });
    }
});

export default router;
