import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/saved-questions
 * Get all saved questions
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { filter } = req.query;

        // First get saved questions with basic question data
        const { data: savedQuestions, error: sqError } = await supabaseAdmin
            .from('saved_questions')
            .select(`
                id,
                saved_at,
                notes,
                question_id,
                question:questions(
                    id,
                    difficulty,
                    correct_answer_index,
                    topic_id
                )
            `)
            .eq('user_id', req.user!.id)
            .order('saved_at', { ascending: false });

        if (sqError) throw sqError;

        // Get user's preferred language
        const languageId = req.user?.preferred_language_id;

        // Get translations for the questions (filtered by language if available)
        const questionIds = savedQuestions?.map(sq => (sq.question as any)?.id).filter(Boolean) || [];

        let translations: any[] = [];
        if (questionIds.length > 0) {
            let query = supabaseAdmin
                .from('question_translations')
                .select('*')
                .in('question_id', questionIds);

            // Filter by user's preferred language if set
            if (languageId) {
                query = query.eq('language_id', languageId);
            }

            const { data: translationData } = await query;
            translations = translationData || [];

            // If no translations found for preferred language, get all and use first available
            if (translations.length === 0 && languageId) {
                const { data: fallbackData } = await supabaseAdmin
                    .from('question_translations')
                    .select('*')
                    .in('question_id', questionIds);
                translations = fallbackData || [];
            }
        }

        // Get topic and subject data
        const topicIds = savedQuestions?.map(sq => (sq.question as any)?.topic_id).filter(Boolean) || [];

        let topics: any[] = [];
        let subjects: any[] = [];
        if (topicIds.length > 0) {
            const { data: topicData } = await supabaseAdmin
                .from('topics')
                .select('id, name, subject_id')
                .in('id', topicIds);
            topics = topicData || [];

            const subjectIds = topics.map(t => t.subject_id).filter(Boolean);
            if (subjectIds.length > 0) {
                const { data: subjectData } = await supabaseAdmin
                    .from('subjects')
                    .select('id, name, color')
                    .in('id', subjectIds);
                subjects = subjectData || [];
            }
        }

        // Format response
        const formatted = savedQuestions?.map(sq => {
            const q = sq.question as any;
            if (!q) return null;

            const translation = translations.find(t => t.question_id === q.id);
            const topic = topics.find(t => t.id === q.topic_id);
            const subject = topic ? subjects.find(s => s.id === topic.subject_id) : null;

            return {
                id: sq.id,
                question_id: q.id,
                question: translation?.question_text || 'No translation available',
                options: translation?.options || [],
                category: subject?.name || topic?.name || 'General',
                difficulty: q.difficulty || 'Medium',
                savedDate: sq.saved_at,
                color: subject?.color || 'blue',
                notes: sq.notes
            };
        }).filter(Boolean);

        // Filter by category if specified
        if (filter && filter !== 'all') {
            const filtered = formatted?.filter(q =>
                q?.category?.toLowerCase() === (filter as string).toLowerCase()
            );
            return res.json(filtered);
        }

        res.json(formatted || []);
    } catch (error) {
        console.error('Get saved questions error:', error);
        res.status(500).json({ error: 'Failed to fetch saved questions' });
    }
});

/**
 * POST /api/saved-questions
 * Save a question
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { question_id, notes } = req.body;

        // Check if already saved
        const { data: existing } = await supabaseAdmin
            .from('saved_questions')
            .select('id')
            .eq('user_id', req.user!.id)
            .eq('question_id', question_id)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'Question already saved' });
        }

        const { data, error } = await supabaseAdmin
            .from('saved_questions')
            .insert({
                user_id: req.user!.id,
                question_id,
                notes
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Save question error:', error);
        res.status(500).json({ error: 'Failed to save question' });
    }
});

/**
 * DELETE /api/saved-questions/:id
 * Remove saved question
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('saved_questions')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user!.id);

        if (error) throw error;

        res.json({ message: 'Question removed from saved' });
    } catch (error) {
        console.error('Delete saved question error:', error);
        res.status(500).json({ error: 'Failed to remove question' });
    }
});

/**
 * GET /api/saved-questions/subject/:subjectId
 * Get saved questions filtered by subject (via topic relationship)
 */
router.get('/subject/:subjectId', authenticate, async (req, res) => {
    try {
        const { subjectId } = req.params;

        // Get exam subject to find master subject_id
        const { data: examSubject } = await supabaseAdmin
            .from('exam_subjects')
            .select('subject_id, exam_id')
            .eq('id', subjectId)
            .single();

        if (!examSubject) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        // Get topics for this subject
        const { data: topics } = await supabaseAdmin
            .from('topics')
            .select('id')
            .eq('subject_id', examSubject.subject_id)
            .or(`exam_id.is.null,exam_id.eq.${examSubject.exam_id}`)
            .eq('is_active', true);

        const topicIds = topics?.map(t => t.id) || [];

        if (topicIds.length === 0) {
            return res.json([]);
        }

        // Get saved questions with question data
        const { data: savedQuestions, error: sqError } = await supabaseAdmin
            .from('saved_questions')
            .select(`
                id,
                saved_at,
                notes,
                question_id,
                question:questions(
                    id,
                    difficulty,
                    correct_answer_index,
                    topic_id
                )
            `)
            .eq('user_id', req.user!.id)
            .order('saved_at', { ascending: false });

        if (sqError) throw sqError;

        // Filter to only questions from this subject's topics
        const filteredSaved = savedQuestions?.filter(sq => {
            const q = sq.question as any;
            return q?.topic_id && topicIds.includes(q.topic_id);
        }) || [];

        if (filteredSaved.length === 0) {
            return res.json([]);
        }

        // Get user's preferred language
        const languageId = req.user?.preferred_language_id;

        // Get translations for these questions
        const questionIds = filteredSaved.map(sq => (sq.question as any)?.id).filter(Boolean);

        let translations: any[] = [];
        if (questionIds.length > 0) {
            let query = supabaseAdmin
                .from('question_translations')
                .select('*')
                .in('question_id', questionIds);

            // Filter by user's preferred language if set
            if (languageId) {
                query = query.eq('language_id', languageId);
            }

            const { data: translationData } = await query;
            translations = translationData || [];

            // If no translations found for preferred language, get all and use first available
            if (translations.length === 0 && languageId) {
                const { data: fallbackData } = await supabaseAdmin
                    .from('question_translations')
                    .select('*')
                    .in('question_id', questionIds);
                translations = fallbackData || [];
            }
        }

        // Get topic names
        const { data: topicData } = await supabaseAdmin
            .from('topics')
            .select('id, name')
            .in('id', topicIds);

        const topicNameMap = new Map(topicData?.map(t => [t.id, t.name]) || []);

        // Format response
        const formatted = filteredSaved.map(sq => {
            const q = sq.question as any;
            if (!q) return null;

            const translation = translations?.find(t => t.question_id === q.id);

            return {
                id: sq.id,
                question_id: q.id,
                question: translation?.question_text || 'No translation available',
                options: translation?.options || [],
                topic: topicNameMap.get(q.topic_id) || 'Unknown',
                difficulty: q.difficulty || 'medium',
                savedDate: sq.saved_at,
                notes: sq.notes
            };
        }).filter(Boolean);

        res.json(formatted);
    } catch (error) {
        console.error('Get saved questions by subject error:', error);
        res.status(500).json({ error: 'Failed to fetch saved questions' });
    }
});

/**
 * GET /api/saved-questions/check/:questionId
 * Check if a question is saved
 */
router.get('/check/:questionId', authenticate, async (req, res) => {
    try {
        const { questionId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('saved_questions')
            .select('id')
            .eq('user_id', req.user!.id)
            .eq('question_id', questionId)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        res.json({
            saved: !!data,
            savedQuestionId: data?.id || null
        });
    } catch (error) {
        console.error('Check saved question error:', error);
        res.status(500).json({ error: 'Failed to check saved question status' });
    }
});

/**
 * POST /api/saved-questions/toggle
 * Toggle save state for a question
 */
router.post('/toggle', authenticate, async (req, res) => {
    try {
        const { question_id } = req.body;

        if (!question_id) {
            return res.status(400).json({ error: 'question_id is required' });
        }

        // Check if already saved
        const { data: existing, error: checkError } = await supabaseAdmin
            .from('saved_questions')
            .select('id')
            .eq('user_id', req.user!.id)
            .eq('question_id', question_id)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            throw checkError;
        }

        if (existing) {
            // Already saved - remove it
            const { error: deleteError } = await supabaseAdmin
                .from('saved_questions')
                .delete()
                .eq('id', existing.id);

            if (deleteError) throw deleteError;

            res.json({ saved: false, message: 'Question removed from saved' });
        } else {
            // Not saved - save it
            const { data, error: insertError } = await supabaseAdmin
                .from('saved_questions')
                .insert({
                    user_id: req.user!.id,
                    question_id
                })
                .select()
                .single();

            if (insertError) throw insertError;

            res.json({ saved: true, id: data.id, message: 'Question saved' });
        }
    } catch (error) {
        console.error('Toggle save question error:', error);
        res.status(500).json({ error: 'Failed to toggle save question' });
    }
});

export default router;

