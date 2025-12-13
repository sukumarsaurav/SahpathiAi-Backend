import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * POST /api/marathon/start
 * Start a new marathon session
 */
router.post('/start', authenticate, async (req, res) => {
    try {
        const { subject_id, exam_id, topic_ids } = req.body;

        if (!topic_ids || topic_ids.length === 0) {
            return res.status(400).json({ error: 'No topics selected' });
        }

        // Get questions for selected topics
        const { data: questions, error: questionsError } = await supabaseAdmin
            .from('questions')
            .select('id')
            .in('topic_id', topic_ids)
            .eq('is_active', true);

        if (questionsError) {
            console.error('Error fetching questions:', questionsError);
            throw questionsError;
        }

        if (!questions || questions.length === 0) {
            return res.status(400).json({ error: 'No questions found for selected topics' });
        }

        // Look up exam_subject_id from subject_id and exam_id (optional)
        let examSubjectId = null;
        if (subject_id && exam_id) {
            const { data: examSubject } = await supabaseAdmin
                .from('exam_subjects')
                .select('id')
                .eq('subject_id', subject_id)
                .eq('exam_id', exam_id)
                .single();

            examSubjectId = examSubject?.id || null;
        }

        // Create session
        const { data: session, error } = await supabaseAdmin
            .from('marathon_sessions')
            .insert({
                user_id: req.user!.id,
                exam_subject_id: examSubjectId,
                selected_topic_ids: topic_ids,
                status: 'active',
                total_questions: questions.length,
                questions_answered: 0,
                correct_answers: 0,
                questions_mastered: 0,
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating session:', error);
            throw error;
        }

        // Create question queue with initial priorities
        const queueItems = questions.map((q, index) => ({
            session_id: session.id,
            question_id: q.id,
            priority: index,
            times_shown: 0,
            times_correct: 0,
            times_wrong: 0,
            is_mastered: false
        }));

        const { error: queueError } = await supabaseAdmin.from('marathon_question_queue').insert(queueItems);

        if (queueError) {
            console.error('Error creating question queue:', queueError);
            throw queueError;
        }

        res.status(201).json(session);
    } catch (error) {
        console.error('Start marathon error:', error);
        res.status(500).json({ error: 'Failed to start marathon' });
    }
});

/**
 * GET /api/marathon/session/:sessionId
 * Get current session state
 */
router.get('/session/:sessionId', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('marathon_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('user_id', req.user!.id)
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({ error: 'Failed to fetch session' });
    }
});

/**
 * GET /api/marathon/next-question
 * Get next question using spaced repetition
 */
router.get('/next-question', authenticate, async (req, res) => {
    try {
        const { session_id } = req.query;

        // Get question with lowest priority that isn't mastered
        const { data: queueItem, error } = await supabaseAdmin
            .from('marathon_question_queue')
            .select(`
        *,
        question:questions(
          *,
          translations:question_translations(*, language:languages(*))
        )
      `)
            .eq('session_id', session_id)
            .eq('is_mastered', false)
            .order('priority')
            .limit(1)
            .single();

        if (error || !queueItem) {
            // All questions mastered
            return res.json({ completed: true });
        }

        const q = queueItem.question as any;
        const languageId = req.user?.preferred_language_id;
        const translation = languageId
            ? q.translations.find((t: any) => t.language_id === languageId)
            : q.translations[0];

        // Update times shown
        await supabaseAdmin
            .from('marathon_question_queue')
            .update({
                times_shown: queueItem.times_shown + 1,
                last_shown_at: new Date().toISOString()
            })
            .eq('id', queueItem.id);

        res.json({
            queue_id: queueItem.id,
            question_id: q.id,
            question: translation?.question_text,
            options: translation?.options,
            difficulty: q.difficulty,
            times_shown: queueItem.times_shown + 1,
            translations: q.translations
        });
    } catch (error) {
        console.error('Get next question error:', error);
        res.status(500).json({ error: 'Failed to fetch question' });
    }
});

/**
 * POST /api/marathon/answer
 * Submit answer (tracks time + correctness)
 */
router.post('/answer', authenticate, async (req, res) => {
    try {
        const { session_id, queue_id, question_id, selected_option, time_taken_seconds } = req.body;

        // Get correct answer and translations for explanation
        const { data: question } = await supabaseAdmin
            .from('questions')
            .select(`
                correct_answer_index,
                translations:question_translations(*)
            `)
            .eq('id', question_id)
            .single();

        const isCorrect = question?.correct_answer_index === selected_option;

        // Get explanation from translations
        let explanation: string | null = null;
        if (question?.translations && Array.isArray(question.translations)) {
            const languageId = req.user?.preferred_language_id;
            const translation = languageId
                ? question.translations.find((t: any) => t.language_id === languageId)
                : question.translations[0];
            explanation = translation?.explanation || null;
        }

        // Get current queue item
        const { data: queueItem } = await supabaseAdmin
            .from('marathon_question_queue')
            .select('*')
            .eq('id', queue_id)
            .single();

        // Update queue item with spaced repetition logic
        const timesCorrect = (queueItem?.times_correct || 0) + (isCorrect ? 1 : 0);
        const timesWrong = (queueItem?.times_wrong || 0) + (isCorrect ? 0 : 1);

        // Determine if mastered (correct 3+ times in a row)
        const isMastered = isCorrect && timesCorrect >= 3 && timesWrong === 0;

        // Calculate new priority
        let newPriority = queueItem?.priority || 0;
        if (isCorrect) {
            newPriority += 10; // Show later
        } else {
            newPriority = Math.max(0, newPriority - 5); // Show sooner
        }

        await supabaseAdmin
            .from('marathon_question_queue')
            .update({
                times_correct: isCorrect ? timesCorrect : 0, // Reset if wrong
                times_wrong: timesWrong,
                priority: newPriority,
                is_mastered: isMastered,
                avg_time_seconds: time_taken_seconds
            })
            .eq('id', queue_id);

        // Save answer
        const { data: existingAnswers } = await supabaseAdmin
            .from('marathon_answers')
            .select('attempt_number')
            .eq('session_id', session_id)
            .eq('question_id', question_id)
            .order('attempt_number', { ascending: false })
            .limit(1);

        const attemptNumber = (existingAnswers?.[0]?.attempt_number || 0) + 1;

        await supabaseAdmin.from('marathon_answers').insert({
            session_id,
            question_id,
            selected_option,
            is_correct: isCorrect,
            time_taken_seconds,
            attempt_number: attemptNumber
        });

        // Update session counts
        const { data: session } = await supabaseAdmin
            .from('marathon_sessions')
            .select('questions_answered, correct_answers, questions_mastered')
            .eq('id', session_id)
            .single();

        await supabaseAdmin
            .from('marathon_sessions')
            .update({
                questions_answered: (session?.questions_answered || 0) + 1,
                correct_answers: (session?.correct_answers || 0) + (isCorrect ? 1 : 0),
                questions_mastered: (session?.questions_mastered || 0) + (isMastered ? 1 : 0)
            })
            .eq('id', session_id);

        res.json({
            is_correct: isCorrect,
            correct_answer: question?.correct_answer_index,
            explanation: explanation,
            is_mastered: isMastered
        });
    } catch (error) {
        console.error('Submit answer error:', error);
        res.status(500).json({ error: 'Failed to submit answer' });
    }
});

/**
 * PUT /api/marathon/session/:sessionId/exit
 * Exit marathon early (saves progress)
 */
router.put('/session/:sessionId/exit', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('marathon_sessions')
            .update({
                status: 'exited',
                completed_at: new Date().toISOString()
            })
            .eq('id', sessionId)
            .eq('user_id', req.user!.id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Exit marathon error:', error);
        res.status(500).json({ error: 'Failed to exit marathon' });
    }
});

/**
 * GET /api/marathon/session/:sessionId/summary
 * Get session summary on completion
 */
router.get('/session/:sessionId/summary', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data: session } = await supabaseAdmin
            .from('marathon_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('user_id', req.user!.id)
            .single();

        // Get answer breakdown
        const { data: answers } = await supabaseAdmin
            .from('marathon_answers')
            .select('is_correct, time_taken_seconds')
            .eq('session_id', sessionId);

        const totalAttempts = answers?.length || 0;
        const correctAttempts = answers?.filter(a => a.is_correct).length || 0;
        const avgTime = totalAttempts > 0
            ? Math.round(answers!.reduce((sum, a) => sum + a.time_taken_seconds, 0) / totalAttempts)
            : 0;

        res.json({
            ...session,
            total_attempts: totalAttempts,
            correct_attempts: correctAttempts,
            accuracy: totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
            avg_time_seconds: avgTime
        });
    } catch (error) {
        console.error('Get summary error:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

/**
 * GET /api/marathon/history
 * Get user's marathon history
 */
router.get('/history', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('marathon_sessions')
            .select('*, subject:exam_subjects(*)')
            .eq('user_id', req.user!.id)
            .order('started_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

export default router;
