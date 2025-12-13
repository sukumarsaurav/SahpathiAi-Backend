import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/mistakes
 * Get all user mistakes with translations in user's preferred language
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;
        const preferredLanguageId = req.user!.preferred_language_id;

        // Get all user mistakes (unresolved)
        const { data: allMistakes } = await supabaseAdmin
            .from('user_mistakes')
            .select('id, question_id, selected_option, retry_count, last_attempted')
            .eq('user_id', userId)
            .eq('is_resolved', false)
            .order('last_attempted', { ascending: false });

        if (!allMistakes || allMistakes.length === 0) {
            return res.json([]);
        }

        // Get question IDs
        const questionIds = allMistakes.map(m => m.question_id);

        // Fetch questions with topic info
        const { data: questions } = await supabaseAdmin
            .from('questions')
            .select('id, topic_id, correct_answer_index')
            .in('id', questionIds);

        if (!questions) return res.json([]);

        // Build question lookup
        const questionMap = new Map(questions.map(q => [q.id, q]));

        // Get topic IDs
        const topicIds = [...new Set(questions.filter(q => q.topic_id).map(q => q.topic_id))];

        // Fetch topics
        let topicMap = new Map<string, any>();
        if (topicIds.length > 0) {
            const { data: topics } = await supabaseAdmin
                .from('topics')
                .select('id, name, subject_id')
                .in('id', topicIds);
            if (topics) {
                topicMap = new Map(topics.map(t => [t.id, t]));
            }
        }

        // Get all translations for these questions
        const { data: allTranslations } = await supabaseAdmin
            .from('question_translations')
            .select('question_id, language_id, question_text, options, explanation')
            .in('question_id', questionIds);

        // Build translation map - prioritize user's preferred language
        const translationMap = new Map<string, any>();
        if (allTranslations) {
            for (const t of allTranslations) {
                const existing = translationMap.get(t.question_id);
                // Use preferred language if available, otherwise use first available
                if (!existing || t.language_id === preferredLanguageId) {
                    translationMap.set(t.question_id, t);
                }
            }
        }

        // Format response
        const formatted = allMistakes.map(m => {
            const question = questionMap.get(m.question_id);
            const translation = translationMap.get(m.question_id);
            const topic = question?.topic_id ? topicMap.get(question.topic_id) : null;

            return {
                id: m.id,
                question_id: m.question_id,
                question: translation?.question_text || 'Question text not available',
                options: translation?.options || [],
                explanation: translation?.explanation,
                correct_answer: question?.correct_answer_index ?? 0,
                selected_answer: m.selected_option,
                topic: topic?.name,
                retry_count: m.retry_count || 0,
                last_attempted: m.last_attempted
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Get mistakes error:', error);
        res.status(500).json({ error: 'Failed to fetch mistakes' });
    }
});


/**
 * GET /api/mistakes/summary
 * Get mistake summary grouped by subjects for user's target exam
 */
router.get('/summary', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        console.log('[Mistakes Summary] User ID:', userId);

        // Get user's target exam
        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('target_exam_id')
            .eq('id', userId)
            .single();

        const targetExamId = userData?.target_exam_id;
        console.log('[Mistakes Summary] Target Exam ID:', targetExamId);

        if (!targetExamId) {
            console.log('[Mistakes Summary] No target exam - returning empty');
            return res.json({ total: 0, by_subject: {}, subjects: [] });
        }

        // Get all subjects for the user's target exam
        const { data: examSubjects } = await supabaseAdmin
            .from('exam_subjects')
            .select('id, subject:subjects(id, name, icon, color)')
            .eq('exam_id', targetExamId)
            .eq('is_active', true)
            .order('display_order');

        console.log('[Mistakes Summary] Exam Subjects found:', examSubjects?.length);

        if (!examSubjects || examSubjects.length === 0) {
            return res.json({ total: 0, by_subject: {}, subjects: [] });
        }

        // Get exam subject IDs to subject info map
        const subjectIdToInfo = new Map<string, any>();
        for (const es of examSubjects) {
            const subject = es.subject as any;
            if (subject) {
                subjectIdToInfo.set(subject.id, subject);
            }
        }

        // Get ALL user mistakes (unresolved)
        const { data: allMistakes, error: mistakesError } = await supabaseAdmin
            .from('user_mistakes')
            .select('id, question_id')
            .eq('user_id', userId)
            .eq('is_resolved', false);

        console.log('[Mistakes Summary] Total mistakes:', allMistakes?.length, 'Error:', mistakesError);

        if (!allMistakes || allMistakes.length === 0) {
            return res.json({ total: 0, by_subject: {}, subjects: [] });
        }

        // Get all question IDs from mistakes
        const questionIds = allMistakes.map(m => m.question_id);

        // Fetch questions with their topic_id
        const { data: questions, error: questionsError } = await supabaseAdmin
            .from('questions')
            .select('id, topic_id')
            .in('id', questionIds);

        console.log('[Mistakes Summary] Questions found:', questions?.length, 'Error:', questionsError);

        if (!questions || questions.length === 0) {
            return res.json({ total: allMistakes.length, by_subject: {}, subjects: [] });
        }

        // Get unique topic IDs
        const topicIds = [...new Set(questions.filter(q => q.topic_id).map(q => q.topic_id))];

        if (topicIds.length === 0) {
            console.log('[Mistakes Summary] No topic IDs found on questions');
            return res.json({ total: allMistakes.length, by_subject: {}, subjects: [] });
        }

        // Fetch topics with their subject_id
        const { data: topics, error: topicsError } = await supabaseAdmin
            .from('topics')
            .select('id, subject_id')
            .in('id', topicIds);

        console.log('[Mistakes Summary] Topics found:', topics?.length, 'Error:', topicsError);

        if (!topics || topics.length === 0) {
            console.log('[Mistakes Summary] No topics found');
            return res.json({ total: allMistakes.length, by_subject: {}, subjects: [] });
        }

        // Build topic_id -> subject_id map
        const topicToSubject = new Map<string, string>();
        for (const topic of topics) {
            if (topic.subject_id) {
                topicToSubject.set(topic.id, topic.subject_id);
            }
        }

        // Build question_id -> topic_id map
        const questionToTopic = new Map<string, string>();
        for (const q of questions) {
            if (q.topic_id) {
                questionToTopic.set(q.id, q.topic_id);
            }
        }

        // Count mistakes by subject
        const mistakeCountBySubject = new Map<string, number>();
        for (const mistake of allMistakes) {
            const topicId = questionToTopic.get(mistake.question_id);
            if (topicId) {
                const subjectId = topicToSubject.get(topicId);
                if (subjectId && subjectIdToInfo.has(subjectId)) {
                    mistakeCountBySubject.set(subjectId, (mistakeCountBySubject.get(subjectId) || 0) + 1);
                }
            }
        }

        console.log('[Mistakes Summary] Subject IDs with mistakes:', Array.from(mistakeCountBySubject.keys()));

        // Build result array
        const subjectsWithMistakes = Array.from(mistakeCountBySubject.entries())
            .map(([subjectId, count]) => {
                const subject = subjectIdToInfo.get(subjectId);
                return {
                    id: subjectId,
                    name: subject?.name || 'Unknown',
                    icon: subject?.icon || '📚',
                    color: subject?.color || 'blue',
                    count: count
                };
            })
            .sort((a, b) => b.count - a.count);

        // Calculate total
        const totalMistakes = subjectsWithMistakes.reduce((sum, s) => sum + s.count, 0);

        console.log('[Mistakes Summary] Final:', subjectsWithMistakes.length, 'subjects with', totalMistakes, 'mistakes');

        // Build by_subject map for backwards compatibility
        const bySubject: Record<string, number> = {};
        for (const s of subjectsWithMistakes) {
            bySubject[s.name] = s.count;
        }

        res.json({
            total: totalMistakes,
            by_subject: bySubject,
            subjects: subjectsWithMistakes
        });
    } catch (error) {
        console.error('Get mistake summary error:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

/**
 * GET /api/subjects/:subjectId/mistakes
 * Get user's mistakes for a subject
 */
router.get('/subject/:subjectId', authenticate, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const userId = req.user!.id;

        // Get all user mistakes (unresolved)
        const { data: allMistakes } = await supabaseAdmin
            .from('user_mistakes')
            .select('id, question_id, selected_option, retry_count, last_attempted')
            .eq('user_id', userId)
            .eq('is_resolved', false);

        if (!allMistakes || allMistakes.length === 0) {
            return res.json([]);
        }

        // Get question IDs
        const questionIds = allMistakes.map(m => m.question_id);

        // Fetch questions with topic info
        const { data: questions } = await supabaseAdmin
            .from('questions')
            .select('id, topic_id, correct_answer_index')
            .in('id', questionIds);

        if (!questions) return res.json([]);

        // Get topic IDs and filter by subject
        const topicIds = [...new Set(questions.filter(q => q.topic_id).map(q => q.topic_id))];

        if (topicIds.length === 0) return res.json([]);

        // Resolve subjectId (which might be exam_subjects id) to master subject_id
        // Try to find it in exam_subjects first
        const { data: examSubject } = await supabaseAdmin
            .from('exam_subjects')
            .select('subject_id')
            .eq('id', subjectId)
            .single();

        const masterSubjectId = examSubject ? examSubject.subject_id : subjectId;

        // Get topics that belong to this subject
        const { data: topics } = await supabaseAdmin
            .from('topics')
            .select('id, name, subject_id')
            .in('id', topicIds)
            .eq('subject_id', masterSubjectId);

        if (!topics || topics.length === 0) return res.json([]);

        // Build topic lookup
        const topicMap = new Map(topics.map(t => [t.id, t]));

        // Filter questions that belong to these topics
        const filteredQuestions = questions.filter(q => q.topic_id && topicMap.has(q.topic_id));
        const filteredQuestionIds = new Set(filteredQuestions.map(q => q.id));

        // Build question lookup
        const questionMap = new Map(filteredQuestions.map(q => [q.id, q]));

        // Get user's preferred language
        const preferredLanguageId = req.user!.preferred_language_id;

        // Get all translations for filtered questions with language info
        const { data: allTranslations } = await supabaseAdmin
            .from('question_translations')
            .select('question_id, language_id, question_text, options, explanation, language:languages(id, code, name, native_name)')
            .in('question_id', Array.from(filteredQuestionIds));

        // Build translation map - prioritize user's preferred language
        // Also build all translations per question for language switching
        const translationMap = new Map<string, any>();
        const allTranslationsPerQuestion = new Map<string, any[]>();
        if (allTranslations) {
            for (const t of allTranslations) {
                // Build all translations list
                const existingList = allTranslationsPerQuestion.get(t.question_id) || [];
                existingList.push(t);
                allTranslationsPerQuestion.set(t.question_id, existingList);

                // Build preferred translation map
                const existing = translationMap.get(t.question_id);
                // Use preferred language if available, otherwise use first available
                if (!existing || t.language_id === preferredLanguageId) {
                    translationMap.set(t.question_id, t);
                }
            }
        }


        // Format response
        const formatted = allMistakes
            .filter(m => filteredQuestionIds.has(m.question_id))
            .map(m => {
                const question = questionMap.get(m.question_id);
                const translation = translationMap.get(m.question_id);
                const topic = question?.topic_id ? topicMap.get(question.topic_id) : null;

                return {
                    id: m.id,
                    question_id: m.question_id,
                    question: translation?.question_text || 'Question text not available',
                    options: translation?.options || [],
                    explanation: translation?.explanation,
                    correct_answer: question?.correct_answer_index ?? 0,
                    selected_answer: m.selected_option,
                    topic: topic?.name,
                    retry_count: m.retry_count || 0,
                    last_attempted: m.last_attempted,
                    translations: allTranslationsPerQuestion.get(m.question_id) || []
                };
            });

        res.json(formatted);
    } catch (error) {
        console.error('Get subject mistakes error:', error);
        res.status(500).json({ error: 'Failed to fetch mistakes' });
    }
});

/**
 * POST /api/mistakes/:id/retry
 * Mark mistake as retried
 */
router.post('/:id/retry', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_correct } = req.body;

        const { data: existing } = await supabaseAdmin
            .from('user_mistakes')
            .select('retry_count')
            .eq('id', id)
            .single();

        const { data, error } = await supabaseAdmin
            .from('user_mistakes')
            .update({
                retry_count: (existing?.retry_count || 0) + 1,
                is_resolved: is_correct,
                last_attempted: new Date().toISOString()
            })
            .eq('id', id)
            .eq('user_id', req.user!.id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Retry mistake error:', error);
        res.status(500).json({ error: 'Failed to update mistake' });
    }
});

export default router;
