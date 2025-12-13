import { Router } from 'express';
import { supabase } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/attempts
 * Get user's test history
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;

        const { data, error } = await supabase
            .from('test_attempts')
            .select('*, test:tests(*, subject:exam_subjects(*))')
            .eq('user_id', req.user!.id)
            .not('completed_at', 'is', null)
            .order('completed_at', { ascending: false })
            .range(Number(offset), Number(offset) + Number(limit) - 1);

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get attempts error:', error);
        res.status(500).json({ error: 'Failed to fetch attempts' });
    }
});

/**
 * GET /api/attempts/:id
 * Get specific attempt details
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: attempt, error } = await supabase
            .from('test_attempts')
            .select('*, test:tests(*)')
            .eq('id', id)
            .eq('user_id', req.user!.id)
            .single();

        if (error) throw error;

        // Get answers
        const { data: answers } = await supabase
            .from('user_answers')
            .select(`
        *,
        question:questions(
          *,
          translations:question_translations(*)
        )
      `)
            .eq('attempt_id', id);

        res.json({ ...attempt, answers });
    } catch (error) {
        console.error('Get attempt error:', error);
        res.status(500).json({ error: 'Failed to fetch attempt' });
    }
});

/**
 * POST /api/attempts
 * Start a new test attempt
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { test_id } = req.body;

        // Get question count
        const { count } = await supabase
            .from('test_questions')
            .select('*', { count: 'exact', head: true })
            .eq('test_id', test_id);

        const { data, error } = await supabase
            .from('test_attempts')
            .insert({
                user_id: req.user!.id,
                test_id,
                language_id: req.user!.preferred_language_id,
                total_questions: count || 0,
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Create attempt error:', error);
        res.status(500).json({ error: 'Failed to create attempt' });
    }
});

/**
 * PUT /api/attempts/:id
 * Submit test answers
 */
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { answers, time_taken_seconds } = req.body;

        // Calculate score
        let score = 0;
        for (const answer of answers) {
            const { data: question } = await supabase
                .from('questions')
                .select('correct_answer_index')
                .eq('id', answer.question_id)
                .single();

            const isCorrect = question?.correct_answer_index === answer.selected_option;
            if (isCorrect) score++;

            await supabase.from('user_answers').insert({
                attempt_id: id,
                question_id: answer.question_id,
                selected_option: answer.selected_option,
                is_correct: isCorrect,
                time_taken_seconds: answer.time_taken || 0
            });
        }

        const percentage = Math.round((score / answers.length) * 100);

        const { data, error } = await supabase
            .from('test_attempts')
            .update({
                score,
                percentage,
                time_taken_seconds,
                completed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Submit attempt error:', error);
        res.status(500).json({ error: 'Failed to submit attempt' });
    }
});

export default router;
