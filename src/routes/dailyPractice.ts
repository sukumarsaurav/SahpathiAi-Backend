import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate } from '../middleware/auth';
import { updateConceptStatsRealtime, calculateConceptProficiency } from '../services/personalization';

const router = Router();

/**
 * GET /api/daily-practice/config
 * Get user's saved weightage config
 */
router.get('/config', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('daily_practice_config')
            .select('*')
            .eq('user_id', req.user!.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        // Return default config if not set
        res.json(data || {
            new_topics_percent: 40,
            strong_areas_percent: 20,
            mistakes_percent: 30,
            time_consuming_percent: 10
        });
    } catch (error) {
        console.error('Get config error:', error);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

/**
 * PUT /api/daily-practice/config
 * Save user's weightage config
 */
router.put('/config', authenticate, async (req, res) => {
    try {
        const { new_topics_percent, strong_areas_percent, mistakes_percent, time_consuming_percent } = req.body;

        // Validate percentages sum to 100
        const total = new_topics_percent + strong_areas_percent + mistakes_percent + time_consuming_percent;
        if (total !== 100) {
            return res.status(400).json({ error: 'Percentages must sum to 100' });
        }

        const { data, error } = await supabaseAdmin
            .from('daily_practice_config')
            .upsert({
                user_id: req.user!.id,
                new_topics_percent,
                strong_areas_percent,
                mistakes_percent,
                time_consuming_percent,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Save config error:', error);
        res.status(500).json({ error: 'Failed to save config' });
    }
});

/**
 * GET /api/daily-practice/today
 * Get today's session status for resume functionality
 */
router.get('/today', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        // Get start of today in UTC
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: session, error } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('*')
            .eq('user_id', userId)
            .gte('started_at', today.toISOString())
            .order('started_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !session) {
            return res.json({ session_id: null, status: 'not_started' });
        }

        const status = session.status === 'completed' ? 'completed' : 'in_progress';

        res.json({
            session_id: session.id,
            status: status,
            questions_answered: session.questions_answered,
            total_questions: session.total_questions,
            correct_answers: session.correct_answers
        });
    } catch (error) {
        // No session found - return not_started
        console.log('No daily practice session found for today');
        res.json({ session_id: null, status: 'not_started' });
    }
});

/**
 * GET /api/daily-practice/stats
 * Get available question counts per category
 */
router.get('/stats', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        // Get topics user hasn't attempted (new topics)
        // Get user's test attempts to filter answers
        const { data: attempts } = await supabaseAdmin
            .from('test_attempts')
            .select('id')
            .eq('user_id', userId);
        const attemptIds = attempts?.map(a => a.id) || [];

        const { data: allTopics } = await supabaseAdmin.from('topics').select('id');

        let attemptedTopics: any[] = [];
        if (attemptIds.length > 0) {
            const { data } = await supabaseAdmin
                .from('user_answers')
                .select('question:questions(topic_id)')
                .in('attempt_id', attemptIds);
            attemptedTopics = data || [];
        }

        const attemptedTopicIds = new Set(attemptedTopics?.map(a => (a.question as any)?.topic_id));
        const newTopicIds = allTopics?.filter(t => !attemptedTopicIds.has(t.id)).map(t => t.id) || [];

        // Count questions in new topics
        const { count: newTopicsCount } = await supabaseAdmin
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .in('topic_id', newTopicIds.length > 0 ? newTopicIds : ['none']);

        // Get strong areas (>80% accuracy)
        // This is simplified - in production, calculate per-topic accuracy
        const { count: strongAreasCount } = await supabaseAdmin
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        // Count mistakes
        const { count: mistakesCount } = await supabaseAdmin
            .from('user_mistakes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_resolved', false);

        // Count time-consuming (questions where user took >2x average)
        // Simplified for now
        // Count time-consuming (questions where user took >2x average)
        // Simplified for now
        let timeConsumingCount = 0;
        if (attemptIds.length > 0) {
            const { count } = await supabaseAdmin
                .from('user_answers')
                .select('*', { count: 'exact', head: true })
                .in('attempt_id', attemptIds)
                .gt('time_taken_seconds', 60);
            timeConsumingCount = count || 0;
        }

        res.json({
            new_topics: newTopicsCount || 0,
            strong_areas: strongAreasCount || 0,
            mistakes: mistakesCount || 0,
            time_consuming: timeConsumingCount || 0
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

/**
 * POST /api/daily-practice/generate
 * Generate personalized practice session with smart question selection
 * 
 * Categories:
 * - Mistakes (30%): Unresolved mistakes + previously skipped questions
 * - Time-consuming (10%): Questions where user took longer than average
 * - Strong areas (20%): High accuracy concepts due for review (spaced repetition)
 * - New topics (40%): Concepts user hasn't attempted yet
 */
router.post('/generate', authenticate, async (req, res) => {
    try {
        const { totalQuestions, config } = req.body;
        const userId = req.user!.id;

        // Calculate question counts per category
        const mistakesCount = Math.round(totalQuestions * (config.mistakes / 100));
        const timeConsumingCount = Math.round(totalQuestions * (config.timeConsuming / 100));
        const strongAreasCount = Math.round(totalQuestions * (config.strongAreas / 100));
        const newTopicsCount = totalQuestions - mistakesCount - timeConsumingCount - strongAreasCount;

        const questions: { question_id: string; category: string }[] = [];
        const usedQuestionIds = new Set<string>();

        // Helper to add questions without duplicates
        const addQuestions = (questionIds: string[], category: string, limit: number) => {
            let added = 0;
            for (const qId of questionIds) {
                if (added >= limit) break;
                if (!usedQuestionIds.has(qId)) {
                    questions.push({ question_id: qId, category });
                    usedQuestionIds.add(qId);
                    added++;
                }
            }
            return added;
        };

        // 1. MISTAKES: Unresolved mistakes + previously skipped questions
        if (mistakesCount > 0) {
            // Get unresolved mistakes
            const { data: mistakes } = await supabaseAdmin
                .from('user_mistakes')
                .select('question_id')
                .eq('user_id', userId)
                .eq('is_resolved', false)
                .order('created_at', { ascending: false })
                .limit(mistakesCount * 2); // Get extra for fallback

            const mistakeIds = mistakes?.map(m => m.question_id) || [];
            let addedMistakes = addQuestions(mistakeIds, 'mistake', mistakesCount);

            // Also include skipped questions from previous sessions
            if (addedMistakes < mistakesCount) {
                const needed = mistakesCount - addedMistakes;
                const { data: skipped } = await supabaseAdmin
                    .from('daily_practice_questions')
                    .select('question_id, session:daily_practice_sessions!inner(user_id)')
                    .eq('is_skipped', true)
                    .eq('session.user_id', userId)
                    .order('answered_at', { ascending: false })
                    .limit(needed * 2);

                const skippedIds = skipped?.map(s => s.question_id) || [];
                addQuestions(skippedIds, 'mistake', needed);
            }
        }

        // 2. TIME-CONSUMING: Questions where user took significantly longer
        if (timeConsumingCount > 0) {
            // Get user's average time per question
            const { data: avgData } = await supabaseAdmin
                .from('user_answers')
                .select('time_taken_seconds')
                .eq('user_id', userId)
                .not('time_taken_seconds', 'is', null);

            const times = avgData?.map(a => a.time_taken_seconds).filter(t => t > 0) || [];
            const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 60;
            const slowThreshold = avgTime * 1.5; // Questions taking 1.5x longer than average

            // Get questions where user took longer than threshold
            const { data: slowQuestions } = await supabaseAdmin
                .from('user_answers')
                .select('question_id')
                .eq('user_id', userId)
                .gt('time_taken_seconds', slowThreshold)
                .order('time_taken_seconds', { ascending: false })
                .limit(timeConsumingCount * 3);

            const slowIds = slowQuestions?.map(s => s.question_id) || [];
            addQuestions(slowIds, 'time_consuming', timeConsumingCount);
        }

        // 3. STRONG AREAS: High proficiency concepts due for review (spaced repetition)
        if (strongAreasCount > 0) {
            const today = new Date().toISOString().split('T')[0];

            // Get concepts with high proficiency that are due for review
            const { data: strongConcepts } = await supabaseAdmin
                .from('user_concept_stats')
                .select('concept_id')
                .eq('user_id', userId)
                .in('proficiency_level', ['strong', 'mastered', 'medium'])
                .lte('next_review_date', today)
                .order('next_review_date', { ascending: true })
                .limit(strongAreasCount * 2);

            if (strongConcepts && strongConcepts.length > 0) {
                const conceptIds = strongConcepts.map(c => c.concept_id);

                // Get questions linked to these concepts
                const { data: conceptQuestions } = await supabaseAdmin
                    .from('question_concepts')
                    .select('question_id')
                    .in('concept_id', conceptIds)
                    .limit(strongAreasCount * 3);

                const strongIds = conceptQuestions?.map(q => q.question_id) || [];
                addQuestions(strongIds, 'strong_area', strongAreasCount);
            }
        }

        // 4. NEW TOPICS: Concepts user hasn't attempted yet
        if (newTopicsCount > 0) {
            // Get concepts user has already attempted
            const { data: attemptedConcepts } = await supabaseAdmin
                .from('user_concept_stats')
                .select('concept_id')
                .eq('user_id', userId);

            const attemptedConceptIds = attemptedConcepts?.map(c => c.concept_id) || [];

            // Build query for questions linked to unattempted concepts
            let newTopicsQuery = supabaseAdmin
                .from('question_concepts')
                .select('question_id, concept_id')
                .limit(newTopicsCount * 3);

            if (attemptedConceptIds.length > 0) {
                // Get concepts NOT in the attempted list
                const { data: newConcepts } = await supabaseAdmin
                    .from('concepts')
                    .select('id')
                    .not('id', 'in', `(${attemptedConceptIds.join(',')})`)
                    .limit(20);

                if (newConcepts && newConcepts.length > 0) {
                    const newConceptIds = newConcepts.map(c => c.id);
                    const { data: newQuestions } = await supabaseAdmin
                        .from('question_concepts')
                        .select('question_id')
                        .in('concept_id', newConceptIds)
                        .limit(newTopicsCount * 3);

                    const newIds = newQuestions?.map(q => q.question_id) || [];
                    addQuestions(newIds, 'new_topic', newTopicsCount);
                }
            } else {
                // User hasn't attempted anything, get any concept-linked questions
                const { data: anyQuestions } = await supabaseAdmin
                    .from('question_concepts')
                    .select('question_id')
                    .limit(newTopicsCount * 3);

                const anyIds = anyQuestions?.map(q => q.question_id) || [];
                addQuestions(anyIds, 'new_topic', newTopicsCount);
            }
        }

        // 5. FALLBACK: Fill remaining slots with random questions
        const neededCount = totalQuestions - questions.length;
        if (neededCount > 0) {
            // Get random questions not already selected
            const excludeIds = Array.from(usedQuestionIds);
            let randomQuery = supabaseAdmin
                .from('questions')
                .select('id')
                .eq('is_active', true)
                .limit(neededCount * 2);

            if (excludeIds.length > 0) {
                randomQuery = randomQuery.not('id', 'in', `(${excludeIds.join(',')})`);
            }

            const { data: randomQuestions } = await randomQuery;

            if (randomQuestions) {
                // Distribute random questions across categories that need more
                const categoryShortages = {
                    new_topic: newTopicsCount - questions.filter(q => q.category === 'new_topic').length,
                    strong_area: strongAreasCount - questions.filter(q => q.category === 'strong_area').length,
                    time_consuming: timeConsumingCount - questions.filter(q => q.category === 'time_consuming').length,
                    mistake: mistakesCount - questions.filter(q => q.category === 'mistake').length
                };

                let randomIdx = 0;
                for (const [category, shortage] of Object.entries(categoryShortages)) {
                    for (let i = 0; i < shortage && randomIdx < randomQuestions.length; i++) {
                        const q = randomQuestions[randomIdx++];
                        if (!usedQuestionIds.has(q.id)) {
                            questions.push({ question_id: q.id, category });
                            usedQuestionIds.add(q.id);
                        }
                    }
                }
            }
        }

        // Shuffle questions for variety
        questions.sort(() => Math.random() - 0.5);

        // Create session
        const { data: session, error } = await supabaseAdmin
            .from('daily_practice_sessions')
            .insert({
                user_id: userId,
                total_questions: questions.length,
                config_used: config,
                status: 'active',
                questions_answered: 0,
                correct_answers: 0,
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Add questions to session
        const sessionQuestions = questions.map((q, i) => ({
            session_id: session.id,
            question_id: q.question_id,
            category: q.category,
            order_index: i,
            is_answered: false
        }));

        await supabaseAdmin.from('daily_practice_questions').insert(sessionQuestions);

        res.status(201).json({
            sessionId: session.id,
            totalQuestions: questions.length,
            breakdown: {
                new_topics: questions.filter(q => q.category === 'new_topic').length,
                strong_areas: questions.filter(q => q.category === 'strong_area').length,
                mistakes: questions.filter(q => q.category === 'mistake').length,
                time_consuming: questions.filter(q => q.category === 'time_consuming').length
            }
        });
    } catch (error) {
        console.error('Generate session error:', error);
        res.status(500).json({ error: 'Failed to generate session' });
    }
});

/**
 * GET /api/daily-practice/session/:sessionId
 * Get current session
 */
router.get('/session/:sessionId', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('daily_practice_sessions')
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
 * GET /api/daily-practice/session/:sessionId/next
 * Get next question
 */
router.get('/session/:sessionId/next', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data: questionItem, error } = await supabaseAdmin
            .from('daily_practice_questions')
            .select(`
        *,
        question:questions(
          *,
          translations:question_translations(*, language:languages(*))
        )
      `)
            .eq('session_id', sessionId)
            .eq('is_answered', false)
            .order('order_index')
            .limit(1)
            .single();

        if (error || !questionItem) {
            return res.json({ completed: true });
        }

        const q = questionItem.question as any;
        const languageId = req.user?.preferred_language_id;
        const translation = languageId
            ? q.translations.find((t: any) => t.language_id === languageId)
            : q.translations[0];

        res.json({
            id: questionItem.id,
            question_id: q.id,
            question: translation?.question_text,
            options: translation?.options,
            category: questionItem.category,
            order: questionItem.order_index + 1,
            translations: q.translations
        });
    } catch (error) {
        console.error('Get next question error:', error);
        res.status(500).json({ error: 'Failed to fetch question' });
    }
});

/**
 * GET /api/daily-practice/session/:sessionId/answered
 * Get already answered questions for session resume
 */
router.get('/session/:sessionId/answered', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data: answeredQuestions, error } = await supabaseAdmin
            .from('daily_practice_questions')
            .select(`
                *,
                question:questions(
                    *,
                    translations:question_translations(*, language:languages(*))
                )
            `)
            .eq('session_id', sessionId)
            .eq('is_answered', true)
            .order('order_index');

        if (error) throw error;

        const questions = answeredQuestions?.map((item: any) => {
            const q = item.question;
            const languageId = req.user?.preferred_language_id;
            const translation = languageId
                ? q.translations?.find((t: any) => t.language_id === languageId)
                : q.translations?.[0];

            return {
                id: item.id,
                question_id: q.id,
                question: translation?.question_text || q.question_text,
                options: translation?.options || q.options,
                category: item.category,
                order: item.order_index + 1,
                isCorrect: item.is_correct,
                selectedOption: null, // We don't store this, but isCorrect is sufficient
                isAnswered: true
            };
        }) || [];

        res.json(questions);
    } catch (error) {
        console.error('Get answered questions error:', error);
        res.status(500).json({ error: 'Failed to fetch answered questions' });
    }
});

/**
 * POST /api/daily-practice/session/:sessionId/answer
 * Submit answer
 */
router.post('/session/:sessionId/answer', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { question_item_id, selected_option, time_taken_seconds } = req.body;

        // Get question item
        const { data: questionItem } = await supabaseAdmin
            .from('daily_practice_questions')
            .select('question_id')
            .eq('id', question_item_id)
            .single();

        // Get correct answer
        const { data: question } = await supabaseAdmin
            .from('questions')
            .select('correct_answer_index')
            .eq('id', questionItem?.question_id)
            .single();

        const isCorrect = question?.correct_answer_index === selected_option;

        // Update question item
        await supabaseAdmin
            .from('daily_practice_questions')
            .update({
                is_answered: true,
                is_correct: isCorrect,
                time_taken_seconds,
                answered_at: new Date().toISOString()
            })
            .eq('id', question_item_id);

        // Update session counts
        const { data: session } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('questions_answered, correct_answers')
            .eq('id', sessionId)
            .single();

        await supabaseAdmin
            .from('daily_practice_sessions')
            .update({
                questions_answered: (session?.questions_answered || 0) + 1,
                correct_answers: (session?.correct_answers || 0) + (isCorrect ? 1 : 0)
            })
            .eq('id', sessionId);

        res.json({
            is_correct: isCorrect,
            correct_answer: question?.correct_answer_index
        });
    } catch (error) {
        console.error('Submit answer error:', error);
        res.status(500).json({ error: 'Failed to submit answer' });
    }
});

/**
 * GET /api/daily-practice/session/:sessionId/summary
 * Get session summary
 */
router.get('/session/:sessionId/summary', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { data: session } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        // Mark as completed
        if (session?.status === 'active') {
            await supabaseAdmin
                .from('daily_practice_sessions')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', sessionId);
        }

        // Get breakdown by category
        const { data: questions } = await supabaseAdmin
            .from('daily_practice_questions')
            .select('category, is_correct')
            .eq('session_id', sessionId);

        const breakdown = {
            new_topic: { total: 0, correct: 0 },
            strong_area: { total: 0, correct: 0 },
            mistake: { total: 0, correct: 0 },
            time_consuming: { total: 0, correct: 0 }
        };

        questions?.forEach(q => {
            const cat = q.category as keyof typeof breakdown;
            breakdown[cat].total++;
            if (q.is_correct) breakdown[cat].correct++;
        });

        res.json({
            ...session,
            accuracy: session?.questions_answered > 0
                ? Math.round((session.correct_answers / session.questions_answered) * 100)
                : 0,
            breakdown
        });
    } catch (error) {
        console.error('Get summary error:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

/**
 * GET /api/daily-practice/history
 * Get daily practice history
 */
router.get('/history', authenticate, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('*')
            .eq('user_id', req.user!.id)
            .order('started_at', { ascending: false })
            .limit(30);

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

/**
 * GET /api/daily-practice/streak
 * Get daily practice streak
 */
router.get('/streak', authenticate, async (req, res) => {
    try {
        const { data: sessions } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('started_at')
            .eq('user_id', req.user!.id)
            .eq('status', 'completed')
            .order('started_at', { ascending: false });

        if (!sessions || sessions.length === 0) {
            return res.json({ current_streak: 0, best_streak: 0 });
        }

        // Calculate streak
        let currentStreak = 0;
        let bestStreak = 0;
        let lastDate: Date | null = null;

        for (const session of sessions) {
            const sessionDate = new Date(session.started_at);
            sessionDate.setHours(0, 0, 0, 0);

            if (!lastDate) {
                currentStreak = 1;
                lastDate = sessionDate;
                continue;
            }

            const dayDiff = Math.floor((lastDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));

            if (dayDiff === 1) {
                currentStreak++;
            } else if (dayDiff > 1) {
                bestStreak = Math.max(bestStreak, currentStreak);
                currentStreak = 1;
            }

            lastDate = sessionDate;
        }

        bestStreak = Math.max(bestStreak, currentStreak);

        res.json({ current_streak: currentStreak, best_streak: bestStreak });
    } catch (error) {
        console.error('Get streak error:', error);
        res.status(500).json({ error: 'Failed to fetch streak' });
    }
});

/**
 * GET /api/daily-practice/session/:sessionId/questions
 * Get ALL questions for a session at once (batch fetch for CustomTest-style flow)
 */
router.get('/session/:sessionId/questions', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user!.id;

        // Verify session belongs to user
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('user_id', userId)
            .single();

        if (sessionError || !session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Get all questions with their translations
        const { data: questionItems, error } = await supabaseAdmin
            .from('daily_practice_questions')
            .select(`
                id,
                question_id,
                category,
                order_index,
                is_answered,
                is_correct,
                question:questions(
                    id,
                    difficulty,
                    correct_answer_index,
                    translations:question_translations(
                        language_id,
                        question_text,
                        options,
                        explanation,
                        language:languages(id, code, name, native_name)
                    )
                )
            `)
            .eq('session_id', sessionId)
            .order('order_index');

        if (error) throw error;

        // Format questions for frontend
        const languageId = req.user?.preferred_language_id;
        const questions = questionItems?.map((item: any) => {
            const q = item.question;
            const translation = languageId
                ? q.translations?.find((t: any) => t.language_id === languageId)
                : q.translations?.[0];

            return {
                id: item.id, // This is the daily_practice_questions id
                question_id: item.question_id,
                order: item.order_index + 1,
                category: item.category,
                difficulty: q.difficulty,
                question: translation?.question_text || '',
                options: translation?.options || [],
                translations: q.translations,
                // Include previous answer state for resume
                is_answered: item.is_answered,
                is_correct: item.is_correct
            };
        }) || [];

        res.json({
            session,
            questions,
            totalQuestions: questions.length
        });
    } catch (error) {
        console.error('Get all questions error:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

/**
 * POST /api/daily-practice/session/:sessionId/submit
 * Submit ALL answers at once (batch submit for CustomTest-style flow)
 * Skipped questions (selected_option === null) are treated as mistakes
 */
router.post('/session/:sessionId/submit', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { answers } = req.body; // Array of { question_item_id, selected_option, time_taken }
        const userId = req.user!.id;

        // Verify session belongs to user and is active
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('daily_practice_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('user_id', userId)
            .single();

        if (sessionError || !session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.status === 'completed') {
            return res.status(400).json({ error: 'Session already completed' });
        }

        let correctCount = 0;
        let answeredCount = 0;
        const mistakesToAdd: any[] = [];
        const results: any[] = [];

        // Process each answer
        for (const answer of answers) {
            const { question_item_id, selected_option, time_taken } = answer;

            // Get question item and correct answer
            const { data: questionItem } = await supabaseAdmin
                .from('daily_practice_questions')
                .select('question_id, category')
                .eq('id', question_item_id)
                .single();

            if (!questionItem) continue;

            const { data: question } = await supabaseAdmin
                .from('questions')
                .select('correct_answer_index')
                .eq('id', questionItem.question_id)
                .single();

            const isSkipped = selected_option === null;
            const isCorrect = !isSkipped && question?.correct_answer_index === selected_option;

            if (!isSkipped) answeredCount++;
            if (isCorrect) correctCount++;

            // Update question item
            await supabaseAdmin
                .from('daily_practice_questions')
                .update({
                    is_answered: !isSkipped,
                    is_correct: isCorrect,
                    is_skipped: isSkipped,
                    time_taken_seconds: time_taken || 0,
                    answered_at: new Date().toISOString()
                })
                .eq('id', question_item_id);

            // Track mistakes (wrong answers AND skipped questions)
            if (!isCorrect) {
                mistakesToAdd.push({
                    user_id: userId,
                    question_id: questionItem.question_id,
                    selected_option: selected_option
                });
            }

            results.push({
                question_item_id,
                question_id: questionItem.question_id,
                is_correct: isCorrect,
                is_skipped: isSkipped,
                correct_answer: question?.correct_answer_index
            });

            // Real-time: Update concept stats (non-blocking)
            if (!isSkipped) {
                updateConceptStatsRealtime(userId, questionItem.question_id, isCorrect, time_taken || 0)
                    .catch(err => console.error('Concept stats update error:', err));
            }
        }

        // Add/update mistakes (including skipped as mistakes)
        for (const mistake of mistakesToAdd) {
            const { data: existing } = await supabaseAdmin
                .from('user_mistakes')
                .select('id, retry_count')
                .eq('user_id', mistake.user_id)
                .eq('question_id', mistake.question_id)
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
                await supabaseAdmin.from('user_mistakes').insert(mistake);
            }
        }

        // Update session as completed
        const { data: updatedSession, error: updateError } = await supabaseAdmin
            .from('daily_practice_sessions')
            .update({
                status: 'completed',
                questions_answered: answeredCount,
                correct_answers: correctCount,
                completed_at: new Date().toISOString()
            })
            .eq('id', sessionId)
            .select()
            .single();

        if (updateError) throw updateError;

        // Update daily progress
        const today = new Date().toISOString().split('T')[0];
        const { data: existingProgress } = await supabaseAdmin
            .from('daily_progress')
            .select('*')
            .eq('user_id', userId)
            .eq('practice_date', today)
            .single();

        if (existingProgress) {
            await supabaseAdmin
                .from('daily_progress')
                .update({
                    questions_completed: existingProgress.questions_completed + answeredCount,
                    correct_answers: existingProgress.correct_answers + correctCount
                })
                .eq('id', existingProgress.id);
        } else {
            await supabaseAdmin.from('daily_progress').insert({
                user_id: userId,
                practice_date: today,
                questions_completed: answeredCount,
                correct_answers: correctCount
            });
        }

        // Update user stats
        await supabaseAdmin.rpc('update_user_stats', { user_id: userId });

        // Batch: Calculate concept proficiency for all answered questions
        const questionIds = results.map(r => r.question_id).filter(Boolean);
        if (questionIds.length > 0) {
            calculateConceptProficiency(userId, questionIds)
                .catch(err => console.error('Proficiency calculation error:', err));
        }

        res.json({
            session: updatedSession,
            results,
            summary: {
                total: answers.length,
                answered: answeredCount,
                correct: correctCount,
                skipped: answers.length - answeredCount,
                accuracy: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0
            }
        });
    } catch (error) {
        console.error('Batch submit error:', error);
        res.status(500).json({ error: 'Failed to submit answers' });
    }
});

export default router;
