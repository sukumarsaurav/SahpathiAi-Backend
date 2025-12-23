import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { updateConceptStatsRealtime } from '../services/personalization';
import { z } from 'zod';

// Constants for mastery and spaced repetition logic
const MASTERY_STREAK_THRESHOLD = 3; // consecutive correct answers needed for mastery
const REVIEW_INTERVAL_DAYS = 7; // days until next review after mastery

// ========== Validation Schemas ==========

/** Schema for POST /:id/retry body */
const retrySchema = z.object({
    is_correct: z.boolean(),
});

/** Schema for POST /:id/practice body */
const practiceSchema = z.object({
    is_correct: z.boolean(),
    time_taken: z.number().positive().optional(),
});

/** Schema for validating UUID route params */
const uuidParamSchema = z.string().uuid();

/** Schema for validating level param (1, 2, or 3+) */
const levelParamSchema = z.coerce.number().int().min(1).max(999);

const router = Router();

// Apply rate limiting to all routes in this router
router.use(apiRateLimiter);

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

        console.log('[Mistakes Summary] Total mistakes:', allMistakes?.length || 0);

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

        if (questionsError) {
            console.error('[Mistakes Summary] Questions query failed:', questionsError);
        }
        console.log('[Mistakes Summary] Questions found:', questions?.length || 0);

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

        if (topicsError) {
            console.error('[Mistakes Summary] Topics query failed:', topicsError);
        }
        console.log('[Mistakes Summary] Topics found:', topics?.length || 0);

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
 * GET /api/mistakes/summary-with-topics/:subjectId
 * Get user's mistakes for a subject grouped by topics
 * Returns: { total, topics: [{ id, name, count, mistakes: [...] }] }
 */
router.get('/summary-with-topics/:subjectId', authenticate, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const userId = req.user!.id;
        const preferredLanguageId = req.user!.preferred_language_id;

        // Resolve subjectId (might be exam_subjects id) to master subject_id
        const { data: examSubject } = await supabaseAdmin
            .from('exam_subjects')
            .select('subject_id')
            .eq('id', subjectId)
            .single();

        const masterSubjectId = examSubject ? examSubject.subject_id : subjectId;

        // Get all user mistakes (unresolved)
        const { data: allMistakes } = await supabaseAdmin
            .from('user_mistakes')
            .select('id, question_id, selected_option, retry_count, last_attempted, mastery_status')
            .eq('user_id', userId)
            .eq('is_resolved', false)
            .order('retry_count', { ascending: false });

        if (!allMistakes || allMistakes.length === 0) {
            return res.json({ total: 0, topics: [] });
        }

        const questionIds = allMistakes.map(m => m.question_id);

        // Fetch questions with topic info
        const { data: questions } = await supabaseAdmin
            .from('questions')
            .select('id, topic_id, correct_answer_index')
            .in('id', questionIds);

        if (!questions) return res.json({ total: 0, topics: [] });

        // Get topic IDs for filtering by subject
        const topicIds = [...new Set(questions.filter(q => q.topic_id).map(q => q.topic_id))];
        if (topicIds.length === 0) return res.json({ total: 0, topics: [] });

        // Get topics that belong to this subject
        const { data: topics } = await supabaseAdmin
            .from('topics')
            .select('id, name, subject_id')
            .in('id', topicIds)
            .eq('subject_id', masterSubjectId)
            .order('name');

        if (!topics || topics.length === 0) return res.json({ total: 0, topics: [] });

        // Build lookups
        const topicMap = new Map(topics.map(t => [t.id, t]));
        const questionToTopic = new Map(
            questions.filter(q => q.topic_id && topicMap.has(q.topic_id))
                .map(q => [q.id, q.topic_id])
        );
        const questionMap = new Map(questions.map(q => [q.id, q]));

        // Get translations
        const filteredQuestionIds = Array.from(questionToTopic.keys());
        const { data: allTranslations } = await supabaseAdmin
            .from('question_translations')
            .select('question_id, language_id, question_text, options, explanation')
            .in('question_id', filteredQuestionIds);

        const translationMap = new Map<string, any>();
        if (allTranslations) {
            for (const t of allTranslations) {
                const existing = translationMap.get(t.question_id);
                if (!existing || t.language_id === preferredLanguageId) {
                    translationMap.set(t.question_id, t);
                }
            }
        }

        // Group mistakes by topic
        const topicMistakesMap = new Map<string, any[]>();
        for (const mistake of allMistakes) {
            const topicId = questionToTopic.get(mistake.question_id);
            if (!topicId) continue;

            const question = questionMap.get(mistake.question_id);
            const translation = translationMap.get(mistake.question_id);
            const topic = topicMap.get(topicId);

            const formattedMistake = {
                id: mistake.id,
                question_id: mistake.question_id,
                question: translation?.question_text || 'Question text not available',
                options: translation?.options || [],
                explanation: translation?.explanation,
                correct_answer: question?.correct_answer_index ?? 0,
                selected_answer: mistake.selected_option,
                topic: topic?.name,
                topic_id: topicId,
                retry_count: mistake.retry_count || 0,
                mastery_status: mistake.mastery_status || 'not_started',
                last_attempted: mistake.last_attempted
            };

            const existing = topicMistakesMap.get(topicId) || [];
            existing.push(formattedMistake);
            topicMistakesMap.set(topicId, existing);
        }

        // Build response with topics and their mistakes
        const topicsWithMistakes = topics
            .filter(t => topicMistakesMap.has(t.id))
            .map(t => ({
                id: t.id,
                name: t.name,
                count: topicMistakesMap.get(t.id)!.length,
                mistakes: topicMistakesMap.get(t.id)!
            }))
            .sort((a, b) => b.count - a.count);

        const total = topicsWithMistakes.reduce((sum, t) => sum + t.count, 0);

        res.json({
            total,
            topics: topicsWithMistakes
        });
    } catch (error) {
        console.error('Get mistakes by topics error:', error);
        res.status(500).json({ error: 'Failed to fetch mistakes by topics' });
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
        // Validate route param
        const idResult = uuidParamSchema.safeParse(req.params.id);
        if (!idResult.success) {
            return res.status(400).json({ error: 'Invalid mistake ID format', details: idResult.error.format() });
        }
        const id = idResult.data;

        // Validate request body
        const bodyResult = retrySchema.safeParse(req.body);
        if (!bodyResult.success) {
            return res.status(400).json({ error: 'Invalid request body', details: bodyResult.error.format() });
        }
        const { is_correct } = bodyResult.data;

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

/**
 * GET /api/mistakes/sets
 * Get grouped mistake sets with smart recommendations
 */
router.get('/sets', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        // Get all user mistakes
        const { data: mistakes, error } = await supabaseAdmin
            .from('user_mistakes')
            .select(`
                id,
                question_id,
                retry_count,
                consecutive_correct,
                mastery_status,
                difficulty,
                created_at
            `)
            .eq('user_id', userId);

        if (error) throw error;
        if (!mistakes || mistakes.length === 0) {
            return res.json({
                sets: [],
                by_difficulty: {},
                by_recency: { this_week: 0, older: 0 },
                recommendations: [],
                total: 0
            });
        }

        // Group by retry level (Set 1: 1 mistake, Set 2: 2 mistakes, Set 3+: 3+)
        const sets = [
            { level: 1, label: 'First Mistakes', mistakes: [] as any[], mastered: 0 },
            { level: 2, label: 'Persistent Errors', mistakes: [] as any[], mastered: 0 },
            { level: 3, label: 'Chronic Issues', mistakes: [] as any[], mastered: 0 }
        ];

        for (const m of mistakes) {
            const level = Math.min(m.retry_count || 1, 3);
            const setIndex = level - 1;
            sets[setIndex].mistakes.push(m);
            if (m.mastery_status === 'mastered') {
                sets[setIndex].mastered++;
            }
        }

        // Group by difficulty
        const byDifficulty: Record<string, { count: number; mastered: number }> = {
            easy: { count: 0, mastered: 0 },
            medium: { count: 0, mastered: 0 },
            hard: { count: 0, mastered: 0 }
        };

        for (const m of mistakes) {
            const diff = m.difficulty || 'medium';
            if (byDifficulty[diff]) {
                byDifficulty[diff].count++;
                if (m.mastery_status === 'mastered') byDifficulty[diff].mastered++;
            }
        }

        // Group by recency
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const thisWeek = mistakes.filter(m => new Date(m.created_at) >= weekAgo).length;
        const older = mistakes.length - thisWeek;

        // Generate smart recommendations
        const recommendations: string[] = [];

        // Check which set needs focus
        const set2Progress = sets[1].mistakes.length > 0
            ? Math.round((sets[1].mastered / sets[1].mistakes.length) * 100)
            : 100;
        const set1Progress = sets[0].mistakes.length > 0
            ? Math.round((sets[0].mastered / sets[0].mistakes.length) * 100)
            : 100;

        if (set1Progress >= 80 && sets[1].mistakes.length > 0) {
            recommendations.push("You've mastered Set 1, time to tackle Set 2!");
        } else if (sets[1].mistakes.length > 0 && set2Progress < 50) {
            recommendations.push("Focus on Set 2 - these are your persistent problem areas");
        }

        if (sets[2].mistakes.length >= 3) {
            recommendations.push(`${sets[2].mistakes.length} chronic issues need your attention`);
        }

        // Get concept-based recommendation (wrapped in try-catch to not fail entire endpoint)
        try {
            const questionIds = mistakes.map(m => m.question_id);
            const { data: conceptData } = await supabaseAdmin
                .from('question_concepts')
                .select('concept_id')
                .in('question_id', questionIds);

            if (conceptData && conceptData.length > 0) {
                // Count mistakes per concept
                const conceptCounts = new Map<string, number>();
                for (const qc of conceptData) {
                    conceptCounts.set(qc.concept_id, (conceptCounts.get(qc.concept_id) || 0) + 1);
                }

                // Find most problematic concept
                let maxConceptId = '';
                let maxCount = 0;
                for (const [id, count] of conceptCounts) {
                    if (count > maxCount) {
                        maxConceptId = id;
                        maxCount = count;
                    }
                }

                if (maxCount >= 3 && maxConceptId) {
                    const { data: concept } = await supabaseAdmin
                        .from('concepts')
                        .select('name')
                        .eq('id', maxConceptId)
                        .maybeSingle(); // Use maybeSingle to avoid error if not found

                    if (concept) {
                        recommendations.push(
                            `${maxCount} mistakes in '${concept.name}' - review this concept first`
                        );
                    }
                }
            }
        } catch (conceptError) {
            console.log('Concept recommendation skipped:', conceptError);
            // Continue without concept recommendations
        }

        res.json({
            sets: sets.map(s => ({
                level: s.level,
                label: s.label,
                count: s.mistakes.length,
                mastered: s.mastered,
                progress: s.mistakes.length > 0
                    ? Math.round((s.mastered / s.mistakes.length) * 100)
                    : 0
            })),
            by_difficulty: byDifficulty,
            by_recency: { this_week: thisWeek, older },
            recommendations,
            total: mistakes.length
        });
    } catch (error) {
        console.error('Get mistake sets error:', error);
        res.status(500).json({ error: 'Failed to fetch mistake sets', details: String(error) });
    }
});

/**
 * GET /api/mistakes/by-concept
 * Get mistakes grouped by concept with accuracy
 */
router.get('/by-concept', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        // Get all user mistakes
        const { data: mistakes } = await supabaseAdmin
            .from('user_mistakes')
            .select('question_id, mastery_status')
            .eq('user_id', userId);

        if (!mistakes || mistakes.length === 0) {
            return res.json({ concepts: [] });
        }

        const questionIds = mistakes.map(m => m.question_id);

        // Get question-concept mappings
        const { data: questionConcepts } = await supabaseAdmin
            .from('question_concepts')
            .select(`
                question_id,
                concept:concepts(id, name, topic:topics(name, subject:subjects(name, icon, color)))
            `)
            .in('question_id', questionIds);

        if (!questionConcepts || questionConcepts.length === 0) {
            return res.json({ concepts: [] });
        }

        // Aggregate by concept
        const conceptMap = new Map<string, {
            id: string;
            name: string;
            topic_name: string;
            subject_name: string;
            subject_icon: string;
            subject_color: string;
            total: number;
            mastered: number;
        }>();

        for (const qc of questionConcepts) {
            const concept = qc.concept as any;
            if (!concept) continue;

            const mistake = mistakes.find(m => m.question_id === qc.question_id);
            const existing = conceptMap.get(concept.id) || {
                id: concept.id,
                name: concept.name,
                topic_name: concept.topic?.name || '',
                subject_name: concept.topic?.subject?.name || '',
                subject_icon: concept.topic?.subject?.icon || '📚',
                subject_color: concept.topic?.subject?.color || '#3b82f6',
                total: 0,
                mastered: 0
            };

            existing.total++;
            if (mistake?.mastery_status === 'mastered') existing.mastered++;
            conceptMap.set(concept.id, existing);
        }

        // Convert to array and sort by total mistakes
        const concepts = Array.from(conceptMap.values())
            .sort((a, b) => b.total - a.total)
            .map(c => ({
                ...c,
                accuracy: c.total > 0 ? Math.round((c.mastered / c.total) * 100) : 0
            }));

        res.json({ concepts });
    } catch (error) {
        console.error('Get mistakes by concept error:', error);
        res.status(500).json({ error: 'Failed to fetch concept mistakes' });
    }
});

/**
 * POST /api/mistakes/:id/practice
 * Practice a mistake question (mastery tracking, NO removal from list)
 */
router.post('/:id/practice', authenticate, async (req, res) => {
    try {
        // Validate route param
        const idResult = uuidParamSchema.safeParse(req.params.id);
        if (!idResult.success) {
            return res.status(400).json({ error: 'Invalid mistake ID format', details: idResult.error.format() });
        }
        const id = idResult.data;

        // Validate request body
        const bodyResult = practiceSchema.safeParse(req.body);
        if (!bodyResult.success) {
            return res.status(400).json({ error: 'Invalid request body', details: bodyResult.error.format() });
        }
        const { is_correct, time_taken } = bodyResult.data;
        const userId = req.user!.id;

        // Get current mistake state
        const { data: current, error: fetchError } = await supabaseAdmin
            .from('user_mistakes')
            .select('*, question:questions(id, difficulty)')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ error: 'Mistake not found' });
        }

        // Calculate new values
        const consecutiveCorrect = is_correct
            ? (current.consecutive_correct || 0) + 1
            : 0; // Reset streak on wrong

        const totalCorrect = is_correct
            ? (current.total_correct || 0) + 1
            : (current.total_correct || 0);

        const retryCount = (current.retry_count || 0) + 1;

        // Mastery: N consecutive correct answers
        const isMastered = consecutiveCorrect >= MASTERY_STREAK_THRESHOLD;
        const masteryStatus = isMastered
            ? 'mastered'
            : consecutiveCorrect > 0
                ? 'practicing'
                : 'not_started';

        // Calculate next review date for mastered questions (spaced repetition)
        let nextReviewDate: string | null = null;
        if (isMastered) {
            const reviewDate = new Date();
            reviewDate.setDate(reviewDate.getDate() + REVIEW_INTERVAL_DAYS); // Spaced repetition
            nextReviewDate = reviewDate.toISOString().split('T')[0];
        }

        // Calculate average time
        const prevAvg = current.time_taken_avg || 0;
        const prevCount = current.total_correct || 0;
        const timeTakenValue = time_taken ?? 0;
        const newAvg = prevCount > 0 && timeTakenValue > 0
            ? Math.round((prevAvg * prevCount + timeTakenValue) / (prevCount + 1))
            : timeTakenValue || prevAvg;

        // Update mistake - DOES NOT set is_resolved
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('user_mistakes')
            .update({
                retry_count: retryCount,
                consecutive_correct: consecutiveCorrect,
                total_correct: totalCorrect,
                mastery_status: masteryStatus,
                next_review_date: nextReviewDate,
                last_attempted: new Date().toISOString(),
                last_correct_at: is_correct ? new Date().toISOString() : current.last_correct_at,
                time_taken_avg: timeTakenValue > 0 ? newAvg : current.time_taken_avg,
                difficulty: current.difficulty || (current.question as any)?.difficulty
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        // Update concept stats if correct (for personalization)
        if (is_correct && current.question_id) {
            await updateConceptStatsRealtime(userId, current.question_id, is_correct, time_taken || 0);
        }

        res.json({
            ...updated,
            consecutive_correct: consecutiveCorrect,
            mastery_status: masteryStatus,
            is_mastered: isMastered,
            progress: isMastered
                ? 'Mastered! Will review in 1 week.'
                : `${consecutiveCorrect}/3 correct to master`
        });
    } catch (error) {
        console.error('Practice mistake error:', error);
        res.status(500).json({ error: 'Failed to record practice' });
    }
});

/**
 * GET /api/mistakes/set/:level
 * Get all mistakes for a specific set level (1, 2, or 3+)
 */
router.get('/set/:level', authenticate, async (req, res) => {
    try {
        const { level } = req.params;
        const userId = req.user!.id;
        const preferredLanguageId = req.user!.preferred_language_id;
        const levelNum = parseInt(level);

        // Build query based on level
        let query = supabaseAdmin
            .from('user_mistakes')
            .select('*')
            .eq('user_id', userId);

        if (levelNum === 1) {
            query = query.eq('retry_count', 1);
        } else if (levelNum === 2) {
            query = query.eq('retry_count', 2);
        } else {
            query = query.gte('retry_count', 3);
        }

        const { data: mistakes, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        if (!mistakes || mistakes.length === 0) return res.json([]);

        // Get question details with translations
        const questionIds = mistakes.map(m => m.question_id);

        const { data: questions } = await supabaseAdmin
            .from('questions')
            .select('id, topic_id, correct_answer_index, difficulty')
            .in('id', questionIds);

        const questionMap = new Map(questions?.map(q => [q.id, q]) || []);

        // Get translations
        const { data: translations } = await supabaseAdmin
            .from('question_translations')
            .select('question_id, language_id, question_text, options, explanation')
            .in('question_id', questionIds);

        const translationMap = new Map<string, any>();
        for (const t of translations || []) {
            const existing = translationMap.get(t.question_id);
            if (!existing || t.language_id === preferredLanguageId) {
                translationMap.set(t.question_id, t);
            }
        }

        // Format response
        const formatted = mistakes.map(m => {
            const question = questionMap.get(m.question_id);
            const translation = translationMap.get(m.question_id);

            return {
                id: m.id,
                question_id: m.question_id,
                question: translation?.question_text || 'Question not available',
                options: translation?.options || [],
                explanation: translation?.explanation,
                correct_answer: question?.correct_answer_index ?? 0,
                difficulty: question?.difficulty || m.difficulty,
                retry_count: m.retry_count,
                consecutive_correct: m.consecutive_correct || 0,
                mastery_status: m.mastery_status || 'not_started',
                last_attempted: m.last_attempted
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Get mistake set error:', error);
        res.status(500).json({ error: 'Failed to fetch mistake set' });
    }
});

export default router;

