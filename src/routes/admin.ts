
import express from 'express';
// Use supabaseAdmin for ALL admin routes to bypass RLS policies
import { supabaseAdmin as supabase } from '../db/supabase';
import { requireAdmin } from '../middleware/adminAuth';
import { authenticate } from '../middleware/auth';

const router = express.Router();


// Apply auth middleware to all admin routes
router.use(authenticate);
router.use(requireAdmin);

// --- EXAM CATEGORIES ---

// GET /api/admin/categories
router.get('/categories', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exam_categories')
            .select('*')
            .order('name');

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// POST /api/admin/categories
router.post('/categories', async (req, res) => {
    try {
        const { name, icon_url } = req.body;
        const { data, error } = await supabase
            .from('exam_categories')
            .insert({ name, icon_url })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// PUT /api/admin/categories/:id
router.put('/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon_url } = req.body;
        const { error } = await supabase
            .from('exam_categories')
            .update({ name, icon_url })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// DELETE /api/admin/categories/:id
router.delete('/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('exam_categories')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// --- EXAMS ---

// GET /api/admin/exams
router.get('/exams', async (req, res) => {
    try {
        const { categoryId } = req.query;
        let query = supabase
            .from('exams')
            .select(`
                *,
                category:exam_categories (id, name)
            `)
            .order('name');

        if (categoryId) {
            query = query.eq('category_id', categoryId);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching exams:', error);
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
});

// POST /api/admin/exams
router.post('/exams', async (req, res) => {
    try {
        const { name, category_id, icon_url, description } = req.body;
        const { data, error } = await supabase
            .from('exams')
            .insert({ name, category_id, icon_url, description })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating exam:', error);
        res.status(500).json({ error: 'Failed to create exam' });
    }
});

// PUT /api/admin/exams/:id
router.put('/exams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category_id, icon_url, description } = req.body;
        const { error } = await supabase
            .from('exams')
            .update({ name, category_id, icon_url, description })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating exam:', error);
        res.status(500).json({ error: 'Failed to update exam' });
    }
});

// DELETE /api/admin/exams/:id
router.delete('/exams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('exams')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting exam:', error);
        res.status(500).json({ error: 'Failed to delete exam' });
    }
});

// --- SUBJECTS ---

// GET /api/admin/subjects
// Get all global subjects
router.get('/subjects', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .order('name');

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching subjects:', error);
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
});

// POST /api/admin/subjects
router.post('/subjects', async (req, res) => {
    try {
        const { name, icon, color, description } = req.body;
        const { data, error } = await supabase
            .from('subjects')
            .insert({ name, icon, color, description })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating subject:', error);
        res.status(500).json({ error: 'Failed to create subject' });
    }
});

// PUT /api/admin/subjects/:id
router.put('/subjects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, color, description } = req.body;
        const { error } = await supabase
            .from('subjects')
            .update({ name, icon, color, description })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating subject:', error);
        res.status(500).json({ error: 'Failed to update subject' });
    }
});

// DELETE /api/admin/subjects/:id
router.delete('/subjects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('subjects')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting subject:', error);
        res.status(500).json({ error: 'Failed to delete subject' });
    }
});

// --- EXAM SUBJECTS (Linking) ---

// GET /api/admin/exam-subjects
// Get subjects linked to a specific exam
router.get('/exam-subjects/:examId', async (req, res) => {
    try {
        const { examId } = req.params;
        const { data, error } = await supabase
            .from('exam_subjects')
            .select(`
                id,
                exam_id,
                subject_id,
                subject:subjects (id, name, icon, color),
                exam:exams (id, name)
            `)
            .eq('exam_id', examId)
            .order('created_at'); // or display_order

        if (error) throw error;

        // Flatten the response for easier use
        const flattenedData = data.map((item: any) => ({
            id: item.id,
            exam_id: item.exam_id,
            subject_id: item.subject_id,
            subject_name: item.subject?.name || 'Unknown',
            exam_name: item.exam?.name || 'Unknown',
            subject: item.subject,
            exam: item.exam
        }));

        res.json(flattenedData);
    } catch (error) {
        console.error('Error fetching exam subjects:', error);
        res.status(500).json({ error: 'Failed to fetch exam subjects' });
    }
});

// POST /api/admin/exam-subjects
// Link a subject to an exam
router.post('/exam-subjects', async (req, res) => {
    try {
        const { exam_id, subject_id } = req.body;
        const { data, error } = await supabase
            .from('exam_subjects')
            .insert({ exam_id, subject_id })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error linking subject:', error);
        res.status(500).json({ error: 'Failed to link subject' });
    }
});

// DELETE /api/admin/exam-subjects/:id
// Unlink a subject from an exam (delete the relationship)
router.delete('/exam-subjects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('exam_subjects')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error unlinking subject:', error);
        res.status(500).json({ error: 'Failed to unlink subject' });
    }
});


// --- TOPICS ---

// GET /api/admin/topics
// Get topics for a specific subject (master list)
router.get('/topics', async (req, res) => {
    try {
        const { subjectId } = req.query;
        let query = supabase.from('topics').select('*').order('name');

        if (subjectId) {
            query = query.eq('subject_id', subjectId);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching topics:', error);
        res.status(500).json({ error: 'Failed to fetch topics' });
    }
});

// POST /api/admin/topics
router.post('/topics', async (req, res) => {
    try {
        const { subject_id, name, description, exam_id } = req.body;
        const { data, error } = await supabase
            .from('topics')
            .insert({ subject_id, name, description, exam_id }) // exam_id optional
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating topic:', error);
        res.status(500).json({ error: 'Failed to create topic' });
    }
});

// PUT /api/admin/topics/:id
router.put('/topics/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { subject_id, name, description, exam_id } = req.body;
        const { error } = await supabase
            .from('topics')
            .update({ subject_id, name, description, exam_id })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating topic:', error);
        res.status(500).json({ error: 'Failed to update topic' });
    }
});

// DELETE /api/admin/topics/:id
router.delete('/topics/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('topics')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting topic:', error);
        res.status(500).json({ error: 'Failed to delete topic' });
    }
});

// GET /api/admin/topics/by-exam-subject/:examSubjectId
// Get topics for a specific exam-subject combination
router.get('/topics/by-exam-subject/:examSubjectId', async (req, res) => {
    try {
        const { examSubjectId } = req.params;

        // First get the exam_subject to find subject_id and exam_id
        const { data: examSubject, error: esError } = await supabase
            .from('exam_subjects')
            .select('subject_id, exam_id')
            .eq('id', examSubjectId)
            .single();

        if (esError) throw esError;

        // Get topics for this subject and exam combination
        let query = supabase
            .from('topics')
            .select('*')
            .eq('subject_id', examSubject.subject_id)
            .order('name');

        // Filter by exam_id if topic has it set, or include topics with null exam_id (general topics)
        query = query.or(`exam_id.eq.${examSubject.exam_id},exam_id.is.null`);

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching topics by exam subject:', error);
        res.status(500).json({ error: 'Failed to fetch topics' });
    }
});

// --- CONCEPTS ---

// GET /api/admin/concepts
// Get concepts for a specific topic
router.get('/concepts', async (req, res) => {
    try {
        const { topicId } = req.query;
        let query = supabase
            .from('concepts')
            .select(`
                *,
                topic:topics (id, name, subject_id)
            `)
            .order('display_order')
            .order('name');

        if (topicId) {
            query = query.eq('topic_id', topicId);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching concepts:', error);
        res.status(500).json({ error: 'Failed to fetch concepts' });
    }
});

// POST /api/admin/concepts
router.post('/concepts', async (req, res) => {
    try {
        const { topic_id, name, description, difficulty_level, display_order } = req.body;
        const { data, error } = await supabase
            .from('concepts')
            .insert({
                topic_id,
                name,
                description,
                difficulty_level: difficulty_level || 5,
                display_order: display_order || 0
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating concept:', error);
        res.status(500).json({ error: 'Failed to create concept' });
    }
});

// PUT /api/admin/concepts/:id
router.put('/concepts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { topic_id, name, description, difficulty_level, display_order, is_active } = req.body;
        const { error } = await supabase
            .from('concepts')
            .update({ topic_id, name, description, difficulty_level, display_order, is_active })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating concept:', error);
        res.status(500).json({ error: 'Failed to update concept' });
    }
});

// DELETE /api/admin/concepts/:id
router.delete('/concepts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('concepts')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting concept:', error);
        res.status(500).json({ error: 'Failed to delete concept' });
    }
});

// POST /api/admin/concepts/bulk
// Bulk import concepts for a topic
router.post('/concepts/bulk', async (req, res) => {
    try {
        const { topic_id, concepts } = req.body;

        if (!topic_id) {
            return res.status(400).json({
                success: 0,
                failed: 0,
                message: 'topic_id is required',
                errors: ['topic_id is required']
            });
        }

        if (!Array.isArray(concepts) || concepts.length === 0) {
            return res.status(400).json({
                success: 0,
                failed: 0,
                message: 'concepts must be a non-empty array',
                errors: ['concepts must be a non-empty array']
            });
        }

        // Verify topic exists
        const { data: topic, error: topicError } = await supabase
            .from('topics')
            .select('id, name')
            .eq('id', topic_id)
            .single();

        if (topicError || !topic) {
            return res.status(404).json({
                success: 0,
                failed: concepts.length,
                message: 'Topic not found',
                errors: ['Topic not found']
            });
        }

        const results = { success: 0, failed: 0, errors: [] as string[] };

        // Process each concept
        for (let i = 0; i < concepts.length; i++) {
            const concept = concepts[i];

            // Validate concept data
            if (!concept.name || typeof concept.name !== 'string') {
                results.failed++;
                results.errors.push(`Concept ${i + 1}: 'name' is required and must be a string`);
                continue;
            }

            // Validate difficulty_level if provided
            if (concept.difficulty_level !== undefined && concept.difficulty_level !== null) {
                const level = Number(concept.difficulty_level);
                if (isNaN(level) || level < 1 || level > 10) {
                    results.failed++;
                    results.errors.push(`Concept ${i + 1} (${concept.name}): 'difficulty_level' must be between 1 and 10`);
                    continue;
                }
            }

            // Insert concept
            try {
                const { error: insertError } = await supabase
                    .from('concepts')
                    .insert({
                        topic_id,
                        name: concept.name,
                        description: concept.description || null,
                        difficulty_level: concept.difficulty_level || 5,
                        display_order: concept.display_order || 0,
                        is_active: true
                    });

                if (insertError) {
                    results.failed++;
                    results.errors.push(`Concept ${i + 1} (${concept.name}): ${insertError.message}`);
                } else {
                    results.success++;
                }
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Concept ${i + 1} (${concept.name}): ${err.message || 'Unknown error'}`);
            }
        }

        // Generate message
        let message = '';
        if (results.success > 0 && results.failed === 0) {
            message = `Successfully imported ${results.success} concept(s)`;
        } else if (results.success === 0 && results.failed > 0) {
            message = `Failed to import all ${results.failed} concept(s)`;
        } else {
            message = `Imported ${results.success} concept(s), ${results.failed} failed`;
        }

        res.status(results.success > 0 ? 200 : 400).json({
            success: results.success,
            failed: results.failed,
            message,
            errors: results.errors
        });
    } catch (error) {
        console.error('Error bulk importing concepts:', error);
        res.status(500).json({
            success: 0,
            failed: 0,
            message: 'Server error during bulk import',
            errors: [(error as Error).message || 'Unknown server error']
        });
    }
});

// --- QUESTION CONCEPTS (Linking) ---

// GET /api/admin/question-concepts/:questionId
// Get concepts linked to a specific question
router.get('/question-concepts/:questionId', async (req, res) => {
    try {
        const { questionId } = req.params;
        const { data, error } = await supabase
            .from('question_concepts')
            .select(`
                id,
                question_id,
                concept_id,
                is_primary,
                concept:concepts (id, name, description, topic_id)
            `)
            .eq('question_id', questionId);

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching question concepts:', error);
        res.status(500).json({ error: 'Failed to fetch question concepts' });
    }
});

// POST /api/admin/question-concepts
// Link a concept to a question
router.post('/question-concepts', async (req, res) => {
    try {
        const { question_id, concept_id, is_primary } = req.body;
        const { data, error } = await supabase
            .from('question_concepts')
            .insert({ question_id, concept_id, is_primary: is_primary || false })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error linking concept:', error);
        res.status(500).json({ error: 'Failed to link concept' });
    }
});

// PUT /api/admin/question-concepts/:id
// Update a question-concept link (e.g., change is_primary)
router.put('/question-concepts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_primary } = req.body;
        const { error } = await supabase
            .from('question_concepts')
            .update({ is_primary })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating question concept:', error);
        res.status(500).json({ error: 'Failed to update question concept' });
    }
});

// DELETE /api/admin/question-concepts/:id
// Unlink a concept from a question
router.delete('/question-concepts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('question_concepts')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error unlinking concept:', error);
        res.status(500).json({ error: 'Failed to unlink concept' });
    }
});

// --- QUESTIONS ---

// GET /api/admin/questions - List questions with pagination & filtering
router.get('/questions', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            topicId,
            subjectId,
            difficulty,
            sortBy = 'created_at',
            sortOrder = 'desc',
            search
        } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        // If subjectId is provided, first get all topic IDs for that subject
        let topicIdsForSubject: string[] = [];
        if (subjectId) {
            const { data: subjectTopics } = await supabase
                .from('topics')
                .select('id')
                .eq('subject_id', subjectId);
            topicIdsForSubject = subjectTopics?.map((t: any) => t.id) || [];
        }

        // Build base query
        let query = supabase
            .from('questions')
            .select(`
                id,
                topic_id,
                difficulty,
                correct_answer_index,
                is_active,
                created_at
            `, { count: 'exact' });

        // Apply topic filter
        if (topicId) {
            query = query.eq('topic_id', topicId);
        } else if (subjectId && topicIdsForSubject.length > 0) {
            // Filter by all topics belonging to the subject
            query = query.in('topic_id', topicIdsForSubject);
        }

        // Apply difficulty filter
        if (difficulty) {
            query = query.eq('difficulty', difficulty);
        }

        // Apply sorting
        if (sortBy === 'difficulty') {
            // For difficulty sorting, we'll sort alphabetically (easy, hard, medium)
            // To get proper order: easy < medium < hard, we use ascending for easy-first
            query = query.order('difficulty', { ascending: sortOrder === 'asc' });
        } else {
            // Default to created_at sorting
            query = query.order('created_at', { ascending: sortOrder === 'asc' });
        }

        // Apply pagination
        query = query.range(offset, offset + Number(limit) - 1);

        const { data: questionsData, error: questionsError, count } = await query;

        if (questionsError) {
            console.error('Questions query error:', questionsError);
            throw questionsError;
        }

        if (!questionsData || questionsData.length === 0) {
            return res.json({ questions: [], total: count || 0 });
        }

        // Get topic IDs from questions
        const topicIds = [...new Set(questionsData.map((q: any) => q.topic_id).filter(Boolean))];

        // Fetch topics with subjects
        let topicsMap: Record<string, any> = {};
        if (topicIds.length > 0) {
            const { data: topics } = await supabase
                .from('topics')
                .select('id, name, subject_id')
                .in('id', topicIds);

            if (topics) {
                // Get subject IDs
                const subjectIds = [...new Set(topics.map((t: any) => t.subject_id).filter(Boolean))];

                // Fetch subjects
                let subjectsMap: Record<string, string> = {};
                if (subjectIds.length > 0) {
                    const { data: subjects } = await supabase
                        .from('subjects')
                        .select('id, name')
                        .in('id', subjectIds);
                    if (subjects) {
                        subjects.forEach((s: any) => { subjectsMap[s.id] = s.name; });
                    }
                }

                topics.forEach((t: any) => {
                    topicsMap[t.id] = { name: t.name, subject_name: subjectsMap[t.subject_id] || null };
                });
            }
        }

        // Fetch English language ID for prioritization
        let englishLanguageId: string | null = null;
        const { data: englishLang } = await supabase
            .from('languages')
            .select('id')
            .eq('code', 'en')
            .single();
        if (englishLang) {
            englishLanguageId = englishLang.id;
        }

        // Fetch translations with language info
        const questionIds = questionsData.map((q: any) => q.id);
        const { data: translations } = await supabase
            .from('question_translations')
            .select('question_id, question_text, language_id')
            .in('question_id', questionIds);

        // Group translations by question_id
        const translationsMap: Record<string, any[]> = {};
        if (translations) {
            translations.forEach((t: any) => {
                if (!translationsMap[t.question_id]) translationsMap[t.question_id] = [];
                translationsMap[t.question_id].push(t);
            });
        }

        // Transform data with English-first translation priority
        const questions = questionsData.map((q: any) => {
            const qTranslations = translationsMap[q.id] || [];

            // Prioritize English translation
            let translation = null;
            if (englishLanguageId) {
                translation = qTranslations.find((t: any) => t.language_id === englishLanguageId);
            }
            // Fallback to first available translation
            if (!translation && qTranslations.length > 0) {
                translation = qTranslations[0];
            }

            const topicInfo = topicsMap[q.topic_id] || { name: null, subject_name: null };

            return {
                id: q.id,
                difficulty: q.difficulty,
                correct_answer_index: q.correct_answer_index,
                is_active: q.is_active,
                created_at: q.created_at,
                question_text: translation?.question_text || '(No translation)',
                topic_name: topicInfo.name || '(No topic)',
                subject_name: topicInfo.subject_name || '(No subject)'
            };
        });

        res.json({ questions, total: count || 0 });
    } catch (error) {
        console.error('Error fetching questions:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

// GET /api/admin/questions/:id - Get single question details
router.get('/questions/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // First, get the question
        const { data: question, error: qError } = await supabase
            .from('questions')
            .select('*')
            .eq('id', id)
            .single();

        if (qError) {
            console.error('Error fetching question:', qError);
            throw qError;
        }

        // Get topic if exists
        let topic = null;
        if (question.topic_id) {
            const { data: topicData } = await supabase
                .from('topics')
                .select('id, name, subject_id')
                .eq('id', question.topic_id)
                .single();
            topic = topicData;
        }

        // Get translations
        const { data: translations, error: tError } = await supabase
            .from('question_translations')
            .select(`
                *,
                language:languages (code, name)
            `)
            .eq('question_id', id);

        if (tError) {
            console.error('Error fetching translations:', tError);
        }

        // Get exam history
        const { data: examHistory, error: ehError } = await supabase
            .from('question_exam_history')
            .select(`
                id,
                exam_id,
                year_asked,
                paper_name,
                exam:exams (id, name)
            `)
            .eq('question_id', id);

        if (ehError) {
            console.error('Error fetching exam history:', ehError);
        }

        res.json({
            ...question,
            topic,
            translations: translations || [],
            exam_history: examHistory || []
        });
    } catch (error) {
        console.error('Error fetching question:', error);
        res.status(500).json({ error: 'Failed to fetch question' });
    }
});

// POST /api/admin/questions - Create new question
router.post('/questions', async (req, res) => {
    try {
        const { topic_id, difficulty, correct_answer_index, translations, exam_history } = req.body;

        // 1. Create Question Core
        const { data: question, error: qError } = await supabase
            .from('questions')
            .insert({
                topic_id,
                difficulty,
                correct_answer_index
            })
            .select()
            .single();

        if (qError) throw qError;

        // 2. Create Translations
        if (translations && translations.length > 0) {
            const translationInserts = translations.map((t: any) => ({
                question_id: question.id,
                language_id: t.language_id,
                question_text: t.question_text,
                options: t.options,
                explanation: t.explanation
            }));

            const { error: tError } = await supabase
                .from('question_translations')
                .insert(translationInserts);

            if (tError) throw tError;
        }

        // 3. Create Exam History
        if (exam_history && exam_history.length > 0) {
            const examHistoryInserts = exam_history
                .filter((eh: any) => eh.exam_id) // Only insert entries with exam_id
                .map((eh: any) => ({
                    question_id: question.id,
                    exam_id: eh.exam_id,
                    year_asked: eh.year_asked || null,
                    paper_name: eh.paper_name || null
                }));

            if (examHistoryInserts.length > 0) {
                const { error: ehError } = await supabase
                    .from('question_exam_history')
                    .insert(examHistoryInserts);

                if (ehError) throw ehError;
            }
        }

        res.status(201).json(question);
    } catch (error) {
        console.error('Error creating question:', error);
        res.status(500).json({ error: 'Failed to create question' });
    }
});

// PUT /api/admin/questions/:id
router.put('/questions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { topic_id, difficulty, correct_answer_index, translations, exam_history } = req.body;

        // 1. Update Core
        const { error: qError } = await supabase
            .from('questions')
            .update({ topic_id, difficulty, correct_answer_index })
            .eq('id', id);

        if (qError) throw qError;

        // 2. Update Translations (Upsert)
        if (translations && translations.length > 0) {
            const translationUpserts = translations.map((t: any) => ({
                question_id: id,
                language_id: t.language_id,
                question_text: t.question_text,
                options: t.options,
                explanation: t.explanation,
                // If it has an ID, keep it, else it's new
                ...(t.id ? { id: t.id } : {})
            }));

            const { error: tError } = await supabase
                .from('question_translations')
                .upsert(translationUpserts);

            if (tError) throw tError;
        }

        // 3. Update Exam History (Delete all and re-insert)
        if (exam_history !== undefined) {
            // Delete existing exam history for this question
            const { error: deleteError } = await supabase
                .from('question_exam_history')
                .delete()
                .eq('question_id', id);

            if (deleteError) throw deleteError;

            // Insert new exam history entries
            if (exam_history && exam_history.length > 0) {
                const examHistoryInserts = exam_history
                    .filter((eh: any) => eh.exam_id) // Only insert entries with exam_id
                    .map((eh: any) => ({
                        question_id: id,
                        exam_id: eh.exam_id,
                        year_asked: eh.year_asked || null,
                        paper_name: eh.paper_name || null
                    }));

                if (examHistoryInserts.length > 0) {
                    const { error: ehError } = await supabase
                        .from('question_exam_history')
                        .insert(examHistoryInserts);

                    if (ehError) throw ehError;
                }
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({ error: 'Failed to update question' });
    }
});

// DELETE /api/admin/questions/:id
router.delete('/questions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('questions')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting question:', error);
        res.status(500).json({ error: 'Failed to delete question' });
    }
});

// POST /api/admin/questions/bulk - Bulk import questions from JSON
router.post('/questions/bulk', async (req, res) => {
    try {
        const { questions, default_language_id, language_code_to_id, selected_language_ids } = req.body;

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Questions array is required' });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as string[],
            created_question_ids: [] as string[]
        };

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            try {
                // Validate required fields
                if (!q.topic_id) {
                    results.failed++;
                    results.errors.push(`Question ${i + 1}: topic_id is required`);
                    continue;
                }
                if (q.correct_answer_index === undefined || q.correct_answer_index < 0 || q.correct_answer_index > 3) {
                    results.failed++;
                    results.errors.push(`Question ${i + 1}: correct_answer_index must be 0-3`);
                    continue;
                }

                // Check if this is multi-language format (has translations object)
                const isMultiLanguage = q.translations && typeof q.translations === 'object' && !Array.isArray(q.translations);

                if (isMultiLanguage) {
                    // Multi-language format: q.translations = { "en": {...}, "hi": {...} }
                    const translationCodes = Object.keys(q.translations);
                    if (translationCodes.length === 0) {
                        results.failed++;
                        results.errors.push(`Question ${i + 1}: translations object is empty`);
                        continue;
                    }

                    // Validate all translations have required fields
                    let hasValidTranslation = true;
                    for (const code of translationCodes) {
                        const t = q.translations[code];
                        if (!t.question_text || !t.options || t.options.length !== 4) {
                            results.failed++;
                            results.errors.push(`Question ${i + 1}: translation '${code}' requires question_text and 4 options`);
                            hasValidTranslation = false;
                            break;
                        }
                    }
                    if (!hasValidTranslation) continue;

                    // 1. Create Question
                    const { data: question, error: qError } = await supabase
                        .from('questions')
                        .insert({
                            topic_id: q.topic_id,
                            difficulty: q.difficulty || 'medium',
                            correct_answer_index: q.correct_answer_index,
                            is_active: q.is_active !== false
                        })
                        .select()
                        .single();

                    if (qError) {
                        results.failed++;
                        results.errors.push(`Question ${i + 1}: ${qError.message}`);
                        continue;
                    }

                    // 2. Create all translations
                    let translationSuccess = true;
                    for (const code of translationCodes) {
                        const t = q.translations[code];
                        // Get language ID from code mapping
                        const languageId = language_code_to_id?.[code];
                        if (!languageId) {
                            results.errors.push(`Question ${i + 1}: Unknown language code '${code}', skipping this translation`);
                            continue;
                        }

                        const { error: tError } = await supabase
                            .from('question_translations')
                            .insert({
                                question_id: question.id,
                                language_id: languageId,
                                question_text: t.question_text,
                                options: t.options,
                                explanation: t.explanation || null
                            });

                        if (tError) {
                            results.errors.push(`Question ${i + 1}: Translation '${code}' failed - ${tError.message}`);
                            translationSuccess = false;
                        }
                    }

                    if (!translationSuccess) {
                        // At least one translation failed, but question was created
                        // We'll still count as partial success
                    }

                    // 3. Add Exam History if provided
                    if (q.exam_history && Array.isArray(q.exam_history)) {
                        for (const eh of q.exam_history) {
                            if (eh.exam_id) {
                                await supabase.from('question_exam_history').insert({
                                    question_id: question.id,
                                    exam_id: eh.exam_id,
                                    year_asked: eh.year_asked || null,
                                    paper_name: eh.paper_name || null
                                });
                            }
                        }
                    }

                    // 4. Link Concepts by name if provided
                    if (q.concept_names && Array.isArray(q.concept_names) && q.concept_names.length > 0) {
                        // Find concepts by name within the same topic
                        const { data: topicConcepts } = await supabase
                            .from('concepts')
                            .select('id, name')
                            .eq('topic_id', q.topic_id);

                        if (topicConcepts) {
                            const conceptMap = new Map(topicConcepts.map((c: any) => [c.name.toLowerCase(), c.id]));
                            for (let ci = 0; ci < q.concept_names.length; ci++) {
                                const conceptName = q.concept_names[ci];
                                const conceptId = conceptMap.get(conceptName.toLowerCase());
                                if (conceptId) {
                                    await supabase.from('question_concepts').insert({
                                        question_id: question.id,
                                        concept_id: conceptId,
                                        is_primary: ci === 0 // First concept is primary
                                    });
                                } else {
                                    results.errors.push(`Question ${i + 1}: Concept '${conceptName}' not found in topic`);
                                }
                            }
                        }
                    }

                    results.success++;
                    results.created_question_ids.push(question.id);

                } else {
                    // Single language format
                    if (!q.question_text || !q.options || q.options.length !== 4) {
                        results.failed++;
                        results.errors.push(`Question ${i + 1}: question_text and 4 options are required`);
                        continue;
                    }

                    // 1. Create Question
                    const { data: question, error: qError } = await supabase
                        .from('questions')
                        .insert({
                            topic_id: q.topic_id,
                            difficulty: q.difficulty || 'medium',
                            correct_answer_index: q.correct_answer_index,
                            is_active: q.is_active !== false
                        })
                        .select()
                        .single();

                    if (qError) {
                        results.failed++;
                        results.errors.push(`Question ${i + 1}: ${qError.message}`);
                        continue;
                    }

                    // 2. Create Translation for the selected language
                    const languageId = q.language_id || default_language_id;
                    if (languageId) {
                        const { error: tError } = await supabase
                            .from('question_translations')
                            .insert({
                                question_id: question.id,
                                language_id: languageId,
                                question_text: q.question_text,
                                options: q.options,
                                explanation: q.explanation || null
                            });

                        if (tError) {
                            results.failed++;
                            results.errors.push(`Question ${i + 1}: Translation failed - ${tError.message}`);
                            // Delete orphan question
                            await supabase.from('questions').delete().eq('id', question.id);
                            continue;
                        }
                    }

                    // 3. Add Exam History if provided (single-language mode)
                    if (q.exam_history && Array.isArray(q.exam_history)) {
                        for (const eh of q.exam_history) {
                            if (eh.exam_id) {
                                await supabase.from('question_exam_history').insert({
                                    question_id: question.id,
                                    exam_id: eh.exam_id,
                                    year_asked: eh.year_asked || null,
                                    paper_name: eh.paper_name || null
                                });
                            }
                        }
                    }

                    // 4. Link Concepts by name if provided (single-language mode)
                    if (q.concept_names && Array.isArray(q.concept_names) && q.concept_names.length > 0) {
                        const { data: topicConcepts } = await supabase
                            .from('concepts')
                            .select('id, name')
                            .eq('topic_id', q.topic_id);

                        if (topicConcepts) {
                            const conceptMap = new Map(topicConcepts.map((c: any) => [c.name.toLowerCase(), c.id]));
                            for (let ci = 0; ci < q.concept_names.length; ci++) {
                                const conceptName = q.concept_names[ci];
                                const conceptId = conceptMap.get(conceptName.toLowerCase());
                                if (conceptId) {
                                    await supabase.from('question_concepts').insert({
                                        question_id: question.id,
                                        concept_id: conceptId,
                                        is_primary: ci === 0
                                    });
                                } else {
                                    results.errors.push(`Question ${i + 1}: Concept '${conceptName}' not found in topic`);
                                }
                            }
                        }
                    }

                    results.success++;
                    results.created_question_ids.push(question.id);
                }

                // Update topic question count (optional, ignore errors)
                try {
                    await supabase.rpc('increment_topic_question_count', { p_topic_id: q.topic_id });
                } catch { }

            } catch (err: any) {
                results.failed++;
                results.errors.push(`Question ${i + 1}: ${err.message || 'Unknown error'}`);
            }
        }

        res.json({
            message: `Imported ${results.success} questions, ${results.failed} failed`,
            ...results
        });
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ error: 'Bulk import failed' });
    }
});


// --- METADATA HELPERS ---

// GET /api/admin/subjects
router.get('/subjects', async (req, res) => {
    try {
        const { data, error } = await supabase.from('subjects').select('*').order('name');
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
});

// GET /api/admin/topics
router.get('/topics', async (req, res) => {
    try {
        const { subjectId } = req.query;
        let query = supabase.from('topics').select('*').order('name');
        if (subjectId) query = query.eq('subject_id', subjectId);

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch topics' });
    }
});

// GET /api/admin/languages
router.get('/languages', async (req, res) => {
    try {
        const { data, error } = await supabase.from('languages').select('*').eq('is_active', true);
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch languages' });
    }
});


// --- USERS ---

// GET /api/admin/users
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 10, search } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = supabase
            .from('users')
            .select('*', { count: 'exact' })
            .range(offset, offset + Number(limit) - 1)
            .order('created_at', { ascending: false });

        if (search) {
            query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
        }

        const { data, count, error } = await query;
        console.log('Admin Users Query Result:', { count, dataLength: data?.length, error });

        if (error) throw error;
        res.json({ users: data, total: count });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// --- ANALYTICS ---

// GET /api/admin/analytics/overview
router.get('/analytics/overview', async (req, res) => {
    try {
        // 1. Total Users
        const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });

        // 2. Total Questions
        const { count: totalQuestions } = await supabase.from('questions').select('*', { count: 'exact', head: true });

        // 3. Total Tests Taken
        const { count: totalTests } = await supabase.from('test_attempts').select('*', { count: 'exact', head: true });

        // 4. Active Today (Users active in last 24h based on user_stats or test_attempts)
        // Using user_stats.last_activity if available, else fallback to 0
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: activeUsers } = await supabase
            .from('user_stats')
            .select('*', { count: 'exact', head: true })
            .gt('last_activity', twentyFourHoursAgo);

        res.json({
            total_users: totalUsers || 0,
            total_questions: totalQuestions || 0,
            total_tests: totalTests || 0,
            active_today: activeUsers || 0
        });
    } catch (error) {
        console.error('Error fetching analytics overview:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// GET /api/admin/analytics/activity
// Returns daily test count associated for last 30 days
router.get('/analytics/activity', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // We can't group by easily with Supabase client alone without RPC.
        // For MVP, we'll fetch ID and created_at and aggregate in JS.
        // Not scalable for huge data, but fine for MVP/Admin dashboard.

        const { data, error } = await supabase
            .from('test_attempts')
            .select('started_at')
            .gt('started_at', thirtyDaysAgo);

        if (error) throw error;

        // Aggregate
        const activityMap: Record<string, number> = {};
        data.forEach((attempt: any) => {
            const date = new Date(attempt.started_at).toISOString().split('T')[0];
            activityMap[date] = (activityMap[date] || 0) + 1;
        });

        // Fill missing days
        const chartData = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            chartData.push({
                date: dateStr,
                count: activityMap[dateStr] || 0
            });
        }

        res.json(chartData);
    } catch (error) {
        console.error('Error fetching activity:', error);
        res.status(500).json({ error: 'Failed to fetch activity' });
    }
});

// GET /api/admin/analytics/registration-stats
// Returns user registration statistics by method and time intervals
router.get('/analytics/registration-stats', async (req, res) => {
    try {
        // Get total users
        const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });

        // Get users registered in last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count: usersLast7Days } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', sevenDaysAgo);

        // Get users registered in last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: usersLast30Days } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', thirtyDaysAgo);

        // Get registration trend (daily for last 30 days)
        const { data: users } = await supabase
            .from('users')
            .select('created_at')
            .gt('created_at', thirtyDaysAgo);

        const registrationTrend: Record<string, number> = {};
        (users || []).forEach((user: any) => {
            const date = new Date(user.created_at).toISOString().split('T')[0];
            registrationTrend[date] = (registrationTrend[date] || 0) + 1;
        });

        // Fill missing days
        const chartData = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            chartData.push({
                date: dateStr,
                count: registrationTrend[dateStr] || 0
            });
        }

        res.json({
            total_users: totalUsers || 0,
            users_last_7_days: usersLast7Days || 0,
            users_last_30_days: usersLast30Days || 0,
            registration_trend: chartData
        });
    } catch (error) {
        console.error('Error fetching registration stats:', error);
        res.status(500).json({ error: 'Failed to fetch registration stats' });
    }
});

// GET /api/admin/analytics/referral-stats
// Returns referral statistics
router.get('/analytics/referral-stats', async (req, res) => {
    try {
        // Total referral codes generated
        const { count: totalCodes } = await supabase
            .from('referral_codes')
            .select('*', { count: 'exact', head: true });

        // Total successful referrals
        const { count: totalReferrals } = await supabase
            .from('referrals')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'completed');

        // Pending referrals
        const { count: pendingReferrals } = await supabase
            .from('referrals')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        // Top referrers (users who referred the most)
        const { data: topReferrers } = await supabase
            .from('referrals')
            .select(`
                referrer_id,
                users!referrals_referrer_id_fkey(email, full_name)
            `)
            .eq('status', 'completed');

        // Count referrals per referrer
        const referrerCounts: Record<string, { count: number; email: string; name: string }> = {};
        (topReferrers || []).forEach((r: any) => {
            if (r.referrer_id) {
                if (!referrerCounts[r.referrer_id]) {
                    referrerCounts[r.referrer_id] = {
                        count: 0,
                        email: r.users?.email || 'Unknown',
                        name: r.users?.full_name || 'Unknown'
                    };
                }
                referrerCounts[r.referrer_id].count++;
            }
        });

        const topReferrersList = Object.entries(referrerCounts)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Referral trend (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentReferrals } = await supabase
            .from('referrals')
            .select('created_at')
            .gt('created_at', thirtyDaysAgo);

        const referralTrend: Record<string, number> = {};
        (recentReferrals || []).forEach((r: any) => {
            const date = new Date(r.created_at).toISOString().split('T')[0];
            referralTrend[date] = (referralTrend[date] || 0) + 1;
        });

        const chartData = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            chartData.push({
                date: dateStr,
                count: referralTrend[dateStr] || 0
            });
        }

        res.json({
            total_codes: totalCodes || 0,
            total_referrals: totalReferrals || 0,
            pending_referrals: pendingReferrals || 0,
            conversion_rate: totalCodes ? Math.round(((totalReferrals || 0) / totalCodes) * 100) : 0,
            top_referrers: topReferrersList,
            referral_trend: chartData
        });
    } catch (error) {
        console.error('Error fetching referral stats:', error);
        res.status(500).json({ error: 'Failed to fetch referral stats' });
    }
});

// GET /api/admin/analytics/subscription-stats
// Returns subscription and revenue statistics
router.get('/analytics/subscription-stats', async (req, res) => {
    try {
        // Get all subscription plans
        const { data: plans } = await supabase
            .from('subscription_plans')
            .select('id, name, price_monthly, price_yearly')
            .eq('is_active', true);

        const planMap: Record<string, { name: string; price_monthly: number; price_yearly: number }> = {};
        (plans || []).forEach((p: any) => {
            planMap[p.id] = { name: p.name, price_monthly: p.price_monthly, price_yearly: p.price_yearly };
        });

        // Get active user subscriptions with plan details
        const { data: subscriptions } = await supabase
            .from('user_subscriptions')
            .select('plan_id, status')
            .eq('status', 'active');

        // Count users by plan
        const planCounts: Record<string, number> = {};
        (subscriptions || []).forEach((sub: any) => {
            const planName = planMap[sub.plan_id]?.name || 'Unknown';
            planCounts[planName] = (planCounts[planName] || 0) + 1;
        });

        // Calculate total paid subscribers
        const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
        const activeSubscribers = subscriptions?.length || 0;
        const freeUsers = (totalUsers || 0) - activeSubscribers;

        // Get paid payment orders
        const { data: paidOrders } = await supabase
            .from('payment_orders')
            .select('amount, paid_at, billing_cycle')
            .eq('status', 'paid');

        // Calculate total income
        const totalIncome = (paidOrders || []).reduce((sum: number, order: any) => sum + parseFloat(order.amount || 0), 0);

        // Income trend (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentPayments } = await supabase
            .from('payment_orders')
            .select('amount, paid_at')
            .eq('status', 'paid')
            .gt('paid_at', thirtyDaysAgo);

        const incomeTrend: Record<string, number> = {};
        (recentPayments || []).forEach((p: any) => {
            if (p.paid_at) {
                const date = new Date(p.paid_at).toISOString().split('T')[0];
                incomeTrend[date] = (incomeTrend[date] || 0) + parseFloat(p.amount || 0);
            }
        });

        const chartData = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            chartData.push({
                date: dateStr,
                amount: incomeTrend[dateStr] || 0
            });
        }

        // Monthly recurring revenue estimation (last 30 days income)
        const last30DaysIncome = Object.values(incomeTrend).reduce((sum, val) => sum + val, 0);

        res.json({
            total_users: totalUsers || 0,
            free_users: freeUsers,
            paid_users: activeSubscribers,
            plan_distribution: planCounts,
            total_income: totalIncome,
            monthly_revenue: last30DaysIncome,
            income_trend: chartData
        });
    } catch (error) {
        console.error('Error fetching subscription stats:', error);
        res.status(500).json({ error: 'Failed to fetch subscription stats' });
    }
});

// GET /api/admin/analytics/content-stats
// Returns content statistics (questions, subjects, topics)
router.get('/analytics/content-stats', async (req, res) => {
    try {
        // Total questions by difficulty
        const { data: questions } = await supabase
            .from('questions')
            .select('difficulty');

        const difficultyCount: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
        (questions || []).forEach((q: any) => {
            difficultyCount[q.difficulty] = (difficultyCount[q.difficulty] || 0) + 1;
        });

        // Total subjects
        const { count: totalSubjects } = await supabase
            .from('subjects')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        // Total topics
        const { count: totalTopics } = await supabase
            .from('topics')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        // Total exams
        const { count: totalExams } = await supabase
            .from('exams')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        // Total resources
        const { count: totalResources } = await supabase
            .from('resources')
            .select('*', { count: 'exact', head: true });

        // Questions per subject (top 10)
        const { data: subjectQuestions } = await supabase
            .from('topics')
            .select(`
                subject_id,
                subjects(name),
                question_count
            `);

        const subjectCounts: Record<string, { name: string; count: number }> = {};
        (subjectQuestions || []).forEach((t: any) => {
            if (t.subject_id && t.subjects) {
                if (!subjectCounts[t.subject_id]) {
                    subjectCounts[t.subject_id] = { name: t.subjects.name, count: 0 };
                }
                subjectCounts[t.subject_id].count += t.question_count || 0;
            }
        });

        const topSubjects = Object.entries(subjectCounts)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        res.json({
            total_questions: questions?.length || 0,
            questions_by_difficulty: difficultyCount,
            total_subjects: totalSubjects || 0,
            total_topics: totalTopics || 0,
            total_exams: totalExams || 0,
            total_resources: totalResources || 0,
            questions_per_subject: topSubjects
        });
    } catch (error) {
        console.error('Error fetching content stats:', error);
        res.status(500).json({ error: 'Failed to fetch content stats' });
    }
});

// --- TEST CATEGORIES ---

// GET /api/admin/test-categories
router.get('/test-categories', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('test_categories')
            .select('*')
            .order('display_order');

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching test categories:', error);
        res.status(500).json({ error: 'Failed to fetch test categories' });
    }
});

// POST /api/admin/test-categories
router.post('/test-categories', async (req, res) => {
    try {
        const { name, slug, description, icon, color, display_order } = req.body;
        const { data, error } = await supabase
            .from('test_categories')
            .insert({ name, slug, description, icon, color, display_order })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating test category:', error);
        res.status(500).json({ error: 'Failed to create test category' });
    }
});

// PUT /api/admin/test-categories/:id
router.put('/test-categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, description, icon, color, display_order, is_active } = req.body;
        const { error } = await supabase
            .from('test_categories')
            .update({ name, slug, description, icon, color, display_order, is_active })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating test category:', error);
        res.status(500).json({ error: 'Failed to update test category' });
    }
});

// DELETE /api/admin/test-categories/:id
router.delete('/test-categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('test_categories')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting test category:', error);
        res.status(500).json({ error: 'Failed to delete test category' });
    }
});

// --- TESTS ---

// GET /api/admin/tests
router.get('/tests', async (req, res) => {
    try {
        const { categoryId, examId } = req.query;
        let query = supabase
            .from('tests')
            .select(`
                *,
                test_category:test_categories(id, name, slug),
                exam:exams(id, name),
                test_questions(count)
            `)
            .order('created_at', { ascending: false });

        if (categoryId) {
            query = query.eq('test_category_id', categoryId);
        }
        if (examId) {
            query = query.eq('exam_id', examId);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Transform to include question count
        const tests = data.map((test: any) => ({
            ...test,
            question_count: test.test_questions?.[0]?.count || 0
        }));

        res.json(tests);
    } catch (error) {
        console.error('Error fetching tests:', error);
        res.status(500).json({ error: 'Failed to fetch tests' });
    }
});

// GET /api/admin/tests/:id
router.get('/tests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('tests')
            .select(`
                *,
                test_category:test_categories(id, name),
                exam:exams(id, name),
                test_questions(
                    id,
                    order_index,
                    question:questions(
                        id,
                        difficulty,
                        translations:question_translations(question_text, language:languages(code))
                    )
                )
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching test:', error);
        res.status(500).json({ error: 'Failed to fetch test' });
    }
});

// POST /api/admin/tests
router.post('/tests', async (req, res) => {
    try {
        const { title, description, exam_id, test_category_id, duration_minutes, difficulty, is_active, subject_id } = req.body;
        const { data, error } = await supabase
            .from('tests')
            .insert({ title, description, exam_id, test_category_id, duration_minutes, difficulty, is_active, subject_id: subject_id || null })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating test:', error);
        res.status(500).json({ error: 'Failed to create test' });
    }
});

// PUT /api/admin/tests/:id
router.put('/tests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, exam_id, test_category_id, duration_minutes, difficulty, is_active, subject_id } = req.body;
        const { error } = await supabase
            .from('tests')
            .update({ title, description, exam_id, test_category_id, duration_minutes, difficulty, is_active, subject_id: subject_id || null })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating test:', error);
        res.status(500).json({ error: 'Failed to update test' });
    }
});

// DELETE /api/admin/tests/:id
router.delete('/tests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('tests')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting test:', error);
        res.status(500).json({ error: 'Failed to delete test' });
    }
});

// POST /api/admin/tests/:id/questions - Add questions to test
router.post('/tests/:id/questions', async (req, res) => {
    try {
        const { id } = req.params;
        const { question_ids } = req.body; // Array of question IDs

        // Get current max order_index
        const { data: existing } = await supabase
            .from('test_questions')
            .select('order_index')
            .eq('test_id', id)
            .order('order_index', { ascending: false })
            .limit(1);

        let startIndex = (existing?.[0]?.order_index || 0) + 1;

        const inserts = question_ids.map((qId: string, idx: number) => ({
            test_id: id,
            question_id: qId,
            order_index: startIndex + idx
        }));

        const { data, error } = await supabase
            .from('test_questions')
            .insert(inserts)
            .select();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error adding questions to test:', error);
        res.status(500).json({ error: 'Failed to add questions' });
    }
});

// DELETE /api/admin/tests/:id/questions/:questionId - Remove question from test
router.delete('/tests/:testId/questions/:linkId', async (req, res) => {
    try {
        const { linkId } = req.params;
        const { error } = await supabase
            .from('test_questions')
            .delete()
            .eq('id', linkId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing question from test:', error);
        res.status(500).json({ error: 'Failed to remove question' });
    }
});

// Seed Data Endpoint
router.post('/seed', async (req, res) => {
    try {
        const { SEED_DATA } = await import('../constants/seedData.js');

        // 1. Exam Categories
        for (const cat of SEED_DATA.examCategories) {
            const { data: existing } = await supabase.from('exam_categories').select('id').eq('name', cat.name).single();
            if (!existing) {
                await supabase.from('exam_categories').insert(cat);
            }
        }

        // 2. Exams
        for (const exam of SEED_DATA.exams) {
            // Find category id
            const { data: cat } = await supabase.from('exam_categories').select('id').eq('name', exam.category_name).single();
            if (cat) {
                const { data: existing } = await supabase.from('exams').select('id').eq('name', exam.name).single();
                if (!existing) {
                    const { category_name, ...examData } = exam;
                    await supabase.from('exams').insert({ ...examData, category_id: cat.id });
                }
            }
        }

        // 3. Subjects
        for (const sub of SEED_DATA.subjects) {
            const { data: existing } = await supabase.from('subjects').select('id').eq('name', sub.name).single();
            if (!existing) {
                await supabase.from('subjects').insert(sub);
            }
        }

        res.json({ message: 'Database seeded successfully' });
    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ error: 'Failed to seed database' });
    }
});

// --- SUPPORT ---

// GET /api/admin/support/tickets - Get all support tickets with filters
router.get('/support/tickets', async (req, res) => {
    try {
        const { status, priority, page = 1, limit = 20, search } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = supabase
            .from('support_tickets')
            .select(`
                *,
                user:users!support_tickets_user_id_fkey(id, email, full_name, avatar_url)
            `, { count: 'exact' })
            .order('created_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }
        if (priority && priority !== 'all') {
            query = query.eq('priority', priority);
        }
        if (search) {
            query = query.or(`ticket_number.ilike.%${search}%,subject.ilike.%${search}%`);
        }

        query = query.range(offset, offset + Number(limit) - 1);

        const { data, error, count } = await query;

        if (error) {
            console.error('Query error:', error);
            throw error;
        }

        res.json({
            tickets: data || [],
            total: count || 0,
            page: Number(page),
            totalPages: Math.ceil((count || 0) / Number(limit))
        });
    } catch (error) {
        console.error('Error fetching support tickets:', error);
        res.status(500).json({ error: 'Failed to fetch support tickets' });
    }
});

// GET /api/admin/support/tickets/:id - Get single ticket with messages
router.get('/support/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: ticket, error } = await supabase
            .from('support_tickets')
            .select(`
                *,
                user:users!support_tickets_user_id_fkey(id, email, full_name, avatar_url)
            `)
            .eq('id', id)
            .single();

        if (error || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Get messages
        const { data: messages } = await supabase
            .from('support_messages')
            .select(`
                *,
                sender:users(id, full_name, avatar_url, role)
            `)
            .eq('ticket_id', id)
            .order('created_at', { ascending: true });

        res.json({ ticket, messages: messages || [] });
    } catch (error) {
        console.error('Error fetching support ticket:', error);
        res.status(500).json({ error: 'Failed to fetch support ticket' });
    }
});

// PUT /api/admin/support/tickets/:id - Update ticket status/priority/assignment
router.put('/support/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, priority, assigned_to } = req.body;

        const updateData: any = { updated_at: new Date().toISOString() };

        if (status) updateData.status = status;
        if (priority) updateData.priority = priority;
        if (assigned_to !== undefined) updateData.assigned_to = assigned_to || null;

        if (status === 'resolved') {
            updateData.resolved_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('support_tickets')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error updating support ticket:', error);
        res.status(500).json({ error: 'Failed to update support ticket' });
    }
});

// POST /api/admin/support/tickets/:id/messages - Admin reply to ticket
router.post('/support/tickets/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const adminId = (req as any).user?.id;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Verify ticket exists
        const { data: ticket, error: ticketError } = await supabase
            .from('support_tickets')
            .select('id, status')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Create the message
        const { data: newMessage, error } = await supabase
            .from('support_messages')
            .insert({
                ticket_id: id,
                sender_id: adminId,
                message,
                is_from_admin: true
            })
            .select(`
                *,
                sender:users(id, full_name, avatar_url, role)
            `)
            .single();

        if (error) throw error;

        // Update ticket status to in_progress if it was open
        if (ticket.status === 'open') {
            await supabase
                .from('support_tickets')
                .update({
                    status: 'in_progress',
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
        } else {
            await supabase
                .from('support_tickets')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', id);
        }

        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Error sending admin reply:', error);
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

// GET /api/admin/support/stats - Support statistics
router.get('/support/stats', async (req, res) => {
    try {
        // Total tickets
        const { count: totalTickets } = await supabase
            .from('support_tickets')
            .select('*', { count: 'exact', head: true });

        // Open tickets
        const { count: openTickets } = await supabase
            .from('support_tickets')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'open');

        // In progress tickets
        const { count: inProgressTickets } = await supabase
            .from('support_tickets')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'in_progress');

        // Resolved tickets
        const { count: resolvedTickets } = await supabase
            .from('support_tickets')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'resolved');

        // Tickets by issue type
        const { data: ticketsByType } = await supabase
            .from('support_tickets')
            .select('issue_type');

        const typeCount: Record<string, number> = {};
        (ticketsByType || []).forEach((t: any) => {
            typeCount[t.issue_type] = (typeCount[t.issue_type] || 0) + 1;
        });

        // Tickets created in last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count: recentTickets } = await supabase
            .from('support_tickets')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', sevenDaysAgo);

        // Average resolution time (for resolved tickets in last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: resolvedRecent } = await supabase
            .from('support_tickets')
            .select('created_at, resolved_at')
            .eq('status', 'resolved')
            .not('resolved_at', 'is', null)
            .gt('resolved_at', thirtyDaysAgo);

        let avgResolutionHours = 0;
        if (resolvedRecent && resolvedRecent.length > 0) {
            const totalHours = resolvedRecent.reduce((sum: number, t: any) => {
                const created = new Date(t.created_at).getTime();
                const resolved = new Date(t.resolved_at).getTime();
                return sum + (resolved - created) / (1000 * 60 * 60);
            }, 0);
            avgResolutionHours = Math.round(totalHours / resolvedRecent.length);
        }

        res.json({
            total_tickets: totalTickets || 0,
            open_tickets: openTickets || 0,
            in_progress_tickets: inProgressTickets || 0,
            resolved_tickets: resolvedTickets || 0,
            tickets_by_type: typeCount,
            recent_tickets_7d: recentTickets || 0,
            avg_resolution_hours: avgResolutionHours
        });
    } catch (error) {
        console.error('Error fetching support stats:', error);
        res.status(500).json({ error: 'Failed to fetch support stats' });
    }
});

// --- PROMO CODES ---

// GET /api/admin/promo-codes - Get all promo codes with usage stats
router.get('/promo-codes', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('promo_codes')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error fetching promo codes:', error);
        res.status(500).json({ error: 'Failed to fetch promo codes' });
    }
});

// GET /api/admin/promo-codes/:id - Get single promo code with usage details
router.get('/promo-codes/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: promoCode, error } = await supabase
            .from('promo_codes')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !promoCode) {
            return res.status(404).json({ error: 'Promo code not found' });
        }

        // Get usage history
        const { data: usages } = await supabase
            .from('promo_code_usages')
            .select(`
                *,
                user:users(id, email, full_name)
            `)
            .eq('promo_code_id', id)
            .order('used_at', { ascending: false });

        res.json({ ...promoCode, usages: usages || [] });
    } catch (error) {
        console.error('Error fetching promo code:', error);
        res.status(500).json({ error: 'Failed to fetch promo code' });
    }
});

// POST /api/admin/promo-codes - Create new promo code
router.post('/promo-codes', async (req, res) => {
    try {
        const {
            code,
            description,
            discount_type = 'percentage',
            discount_value,
            max_uses,
            start_date,
            end_date,
            is_active = true,
            applicable_plan_ids,
            min_order_amount = 0
        } = req.body;

        // Validate required fields
        if (!code || !discount_value || !start_date || !end_date) {
            return res.status(400).json({
                error: 'Code, discount_value, start_date, and end_date are required'
            });
        }

        // Validate discount percentage
        if (discount_type === 'percentage' && (discount_value <= 0 || discount_value > 100)) {
            return res.status(400).json({
                error: 'Discount percentage must be between 1 and 100'
            });
        }

        // Check if code already exists
        const { data: existing } = await supabase
            .from('promo_codes')
            .select('id')
            .eq('code', code.toUpperCase())
            .single();

        if (existing) {
            return res.status(400).json({ error: 'Promo code already exists' });
        }

        const { data, error } = await supabase
            .from('promo_codes')
            .insert({
                code: code.toUpperCase(),
                description,
                discount_type,
                discount_value,
                max_uses: max_uses || null,
                start_date,
                end_date,
                is_active,
                applicable_plan_ids: applicable_plan_ids || null,
                min_order_amount
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating promo code:', error);
        res.status(500).json({ error: 'Failed to create promo code' });
    }
});

// PUT /api/admin/promo-codes/:id - Update promo code
router.put('/promo-codes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            code,
            description,
            discount_type,
            discount_value,
            max_uses,
            start_date,
            end_date,
            is_active,
            applicable_plan_ids,
            min_order_amount
        } = req.body;

        const updateData: any = { updated_at: new Date().toISOString() };

        if (code !== undefined) updateData.code = code.toUpperCase();
        if (description !== undefined) updateData.description = description;
        if (discount_type !== undefined) updateData.discount_type = discount_type;
        if (discount_value !== undefined) updateData.discount_value = discount_value;
        if (max_uses !== undefined) updateData.max_uses = max_uses || null;
        if (start_date !== undefined) updateData.start_date = start_date;
        if (end_date !== undefined) updateData.end_date = end_date;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (applicable_plan_ids !== undefined) updateData.applicable_plan_ids = applicable_plan_ids || null;
        if (min_order_amount !== undefined) updateData.min_order_amount = min_order_amount;

        const { data, error } = await supabase
            .from('promo_codes')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error updating promo code:', error);
        res.status(500).json({ error: 'Failed to update promo code' });
    }
});

// DELETE /api/admin/promo-codes/:id - Delete promo code
router.delete('/promo-codes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('promo_codes')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting promo code:', error);
        res.status(500).json({ error: 'Failed to delete promo code' });
    }
});

// GET /api/admin/promo-codes/:id/usages - Get usage history for a promo code
router.get('/promo-codes/:id/usages', async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const { data, error, count } = await supabase
            .from('promo_code_usages')
            .select(`
                *,
                user:users(id, email, full_name),
                payment_order:payment_orders(id, amount, original_amount, discount_amount)
            `, { count: 'exact' })
            .eq('promo_code_id', id)
            .order('used_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (error) throw error;

        res.json({
            usages: data || [],
            total: count || 0,
            page: Number(page),
            totalPages: Math.ceil((count || 0) / Number(limit))
        });
    } catch (error) {
        console.error('Error fetching promo code usages:', error);
        res.status(500).json({ error: 'Failed to fetch promo code usages' });
    }
});

export default router;
