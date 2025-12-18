
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

// POST /api/admin/topics/:id/suggest-concepts
// Get AI-suggested concepts for a topic based on existing concepts
router.post('/topics/:id/suggest-concepts', async (req, res) => {
    try {
        const { id } = req.params;
        const { count = 10, instruction } = req.body;

        // Get topic with subject info
        const { data: topic, error: topicError } = await supabase
            .from('topics')
            .select('id, name, subject_id, subjects(name)')
            .eq('id', id)
            .single();

        if (topicError || !topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        // Get existing concepts for this topic
        const { data: existingConcepts, error: conceptsError } = await supabase
            .from('concepts')
            .select('name, description')
            .eq('topic_id', id);

        if (conceptsError) throw conceptsError;

        // Import and call AI service
        const { suggestNewConcepts } = await import('../services/openai.js');
        const suggestions = await suggestNewConcepts({
            topicName: topic.name,
            subjectName: (topic.subjects as any)?.name || 'Unknown Subject',
            existingConcepts: existingConcepts || [],
            count,
            customInstruction: instruction
        });

        res.json({ suggestions });
    } catch (error: any) {
        console.error('Error suggesting concepts:', error);
        res.status(500).json({ error: error.message || 'Failed to generate concept suggestions' });
    }
});

// POST /api/admin/tests/suggest-details
router.post('/tests/suggest-details', async (req, res) => {
    try {
        const { exam_id, subject_id, topic_ids, instruction } = req.body;

        if (!topic_ids || !Array.isArray(topic_ids) || topic_ids.length === 0) {
            return res.status(400).json({ error: 'At least one topic is required' });
        }

        // Fetch names
        let examName = 'General';
        if (exam_id) {
            const { data: exam } = await supabase.from('exams').select('name').eq('id', exam_id).single();
            if (exam) examName = exam.name;
        }

        let subjectName = 'General';
        if (subject_id) {
            const { data: subject } = await supabase.from('subjects').select('name').eq('id', subject_id).single();
            if (subject) subjectName = subject.name;
        }

        const { data: topics } = await supabase.from('topics').select('name').in('id', topic_ids);
        const topicNames = topics?.map((t: any) => t.name) || [];

        const { suggestTestDetails } = await import('../services/openai.js');
        const result = await suggestTestDetails({
            examName,
            subjectName,
            topicNames,
            customInstruction: instruction
        });

        res.json(result);
    } catch (error: any) {
        console.error('Error suggesting test details:', error);
        res.status(500).json({ error: 'Failed to suggest test details' });
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
            search,
            aiStatus // 'all' | 'ai_unverified' | 'ai_verified' | 'manual'
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
                is_ai_generated,
                is_verified,
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

        // Apply AI status filter
        if (aiStatus === 'ai_unverified') {
            query = query.eq('is_ai_generated', true).eq('is_verified', false);
        } else if (aiStatus === 'ai_verified') {
            query = query.eq('is_ai_generated', true).eq('is_verified', true);
        } else if (aiStatus === 'manual') {
            query = query.eq('is_ai_generated', false);
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

        // Recent subscriptions (last 10)
        const { data: recentSubscriptions } = await supabase
            .from('user_subscriptions')
            .select(`
                id,
                plan_id,
                status,
                billing_cycle,
                created_at,
                users!inner(name, email)
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        const recentSubsList = (recentSubscriptions || []).map((sub: any) => ({
            id: sub.id,
            user_name: sub.users?.name || 'Unknown',
            user_email: sub.users?.email || '',
            plan_name: planMap[sub.plan_id]?.name || 'Unknown',
            billing_cycle: sub.billing_cycle,
            amount: sub.billing_cycle === 'yearly'
                ? planMap[sub.plan_id]?.price_yearly || 0
                : planMap[sub.plan_id]?.price_monthly || 0,
            status: sub.status,
            created_at: sub.created_at
        }));

        res.json({
            total_users: totalUsers || 0,
            free_users: freeUsers,
            paid_users: activeSubscribers,
            plan_distribution: planCounts,
            total_income: totalIncome,
            monthly_revenue: last30DaysIncome,
            income_trend: chartData,
            recent_subscriptions: recentSubsList
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

        // Content gaps - Topics with low question counts
        const { data: allTopics } = await supabase
            .from('topics')
            .select(`
                id,
                name,
                question_count,
                subjects!inner(name)
            `)
            .eq('is_active', true)
            .order('question_count', { ascending: true })
            .limit(20);

        const topicsWithLowQuestions = (allTopics || [])
            .filter((t: any) => (t.question_count || 0) < 10)
            .map((t: any) => ({
                topic_id: t.id,
                topic_name: t.name,
                subject_name: t.subjects?.name || 'Unknown',
                question_count: t.question_count || 0,
                gap_severity: (t.question_count || 0) === 0 ? 'critical' :
                    (t.question_count || 0) < 5 ? 'high' : 'medium'
            }));

        res.json({
            total_questions: questions?.length || 0,
            questions_by_difficulty: difficultyCount,
            total_subjects: totalSubjects || 0,
            total_topics: totalTopics || 0,
            total_exams: totalExams || 0,
            total_resources: totalResources || 0,
            questions_per_subject: topSubjects,
            content_gaps: topicsWithLowQuestions
        });
    } catch (error) {
        console.error('Error fetching content stats:', error);
        res.status(500).json({ error: 'Failed to fetch content stats' });
    }
});

// GET /api/admin/analytics/user-engagement
// Returns DAU, WAU, MAU and engagement metrics
router.get('/analytics/user-engagement', async (req, res) => {
    try {
        const now = Date.now();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

        // DAU - Users active in last 24 hours
        const { count: dau } = await supabase
            .from('user_stats')
            .select('*', { count: 'exact', head: true })
            .gt('last_activity', oneDayAgo);

        // WAU - Users active in last 7 days
        const { count: wau } = await supabase
            .from('user_stats')
            .select('*', { count: 'exact', head: true })
            .gt('last_activity', sevenDaysAgo);

        // MAU - Users active in last 30 days
        const { count: mau } = await supabase
            .from('user_stats')
            .select('*', { count: 'exact', head: true })
            .gt('last_activity', thirtyDaysAgo);

        // Average session metrics from user_learning_patterns
        const { data: patterns } = await supabase
            .from('user_learning_patterns')
            .select('avg_session_duration_minutes, avg_questions_per_session');

        let avgSessionDuration = 0;
        let avgQuestionsPerSession = 0;
        if (patterns && patterns.length > 0) {
            avgSessionDuration = Math.round(patterns.reduce((sum: number, p: any) => sum + (p.avg_session_duration_minutes || 0), 0) / patterns.length);
            avgQuestionsPerSession = Math.round(patterns.reduce((sum: number, p: any) => sum + (p.avg_questions_per_session || 0), 0) / patterns.length);
        }

        // Retention calculations
        // Users who signed up 7 days ago and are still active
        const sevenDaysAgoStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const sevenDaysAgoEnd = new Date(now - 6 * 24 * 60 * 60 * 1000);
        const { count: usersSignedUp7d } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', sevenDaysAgoStart.toISOString())
            .lt('created_at', sevenDaysAgoEnd.toISOString());

        const { count: usersStillActive7d } = await supabase
            .from('user_stats')
            .select('*, users!inner(created_at)', { count: 'exact', head: true })
            .gt('users.created_at', sevenDaysAgoStart.toISOString())
            .lt('users.created_at', sevenDaysAgoEnd.toISOString())
            .gt('last_activity', sevenDaysAgo);

        const retention7d = usersSignedUp7d && usersSignedUp7d > 0
            ? Math.round(((usersStillActive7d || 0) / usersSignedUp7d) * 100)
            : 0;

        // 30-day retention
        const thirtyDaysAgoStart = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgoEnd = new Date(now - 29 * 24 * 60 * 60 * 1000);
        const { count: usersSignedUp30d } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', thirtyDaysAgoStart.toISOString())
            .lt('created_at', thirtyDaysAgoEnd.toISOString());

        const { count: usersStillActive30d } = await supabase
            .from('user_stats')
            .select('*, users!inner(created_at)', { count: 'exact', head: true })
            .gt('users.created_at', thirtyDaysAgoStart.toISOString())
            .lt('users.created_at', thirtyDaysAgoEnd.toISOString())
            .gt('last_activity', thirtyDaysAgo);

        const retention30d = usersSignedUp30d && usersSignedUp30d > 0
            ? Math.round(((usersStillActive30d || 0) / usersSignedUp30d) * 100)
            : 0;

        // Engagement trend (last 30 days) - daily active users and questions answered
        const { data: dailyActivity } = await supabase
            .from('user_stats')
            .select('last_activity')
            .gt('last_activity', thirtyDaysAgo);

        const dauByDay: Record<string, number> = {};
        (dailyActivity || []).forEach((item: any) => {
            const date = new Date(item.last_activity).toISOString().split('T')[0];
            dauByDay[date] = (dauByDay[date] || 0) + 1;
        });

        // Get questions answered per day from test_attempts
        const { data: testAttempts } = await supabase
            .from('test_attempts')
            .select('started_at, total_questions')
            .gt('started_at', thirtyDaysAgo);

        const questionsByDay: Record<string, number> = {};
        (testAttempts || []).forEach((attempt: any) => {
            const date = new Date(attempt.started_at).toISOString().split('T')[0];
            questionsByDay[date] = (questionsByDay[date] || 0) + (attempt.total_questions || 0);
        });

        const engagementTrend = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            engagementTrend.push({
                date: dateStr,
                dau: dauByDay[dateStr] || 0,
                questions_answered: questionsByDay[dateStr] || 0
            });
        }

        // Funnel data: Signups -> Active -> Tested -> Subscribed
        const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        const { count: usersWithActivity } = await supabase
            .from('user_stats')
            .select('*', { count: 'exact', head: true });

        const { count: usersWithTests } = await supabase
            .from('test_attempts')
            .select('user_id', { count: 'exact', head: true });

        const { count: subscribedUsers } = await supabase
            .from('user_subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        const funnelData = [
            { stage: 'Signups', value: totalUsers || 0, fill: '#3B82F6' },
            { stage: 'Active', value: usersWithActivity || 0, fill: '#10B981' },
            { stage: 'Tested', value: usersWithTests || 0, fill: '#8B5CF6' },
            { stage: 'Subscribed', value: subscribedUsers || 0, fill: '#F59E0B' }
        ];

        res.json({
            dau: dau || 0,
            wau: wau || 0,
            mau: mau || 0,
            avg_session_duration_mins: avgSessionDuration,
            avg_questions_per_session: avgQuestionsPerSession,
            retention_7d: retention7d,
            retention_30d: retention30d,
            engagement_trend: engagementTrend,
            funnel: funnelData
        });
    } catch (error) {
        console.error('Error fetching user engagement stats:', error);
        res.status(500).json({ error: 'Failed to fetch user engagement stats' });
    }
});

// GET /api/admin/analytics/retention-cohorts
// Returns week-over-week retention cohort analysis
router.get('/analytics/retention-cohorts', async (req, res) => {
    try {
        const cohorts = [];
        const now = Date.now();

        // Generate cohorts for last 8 weeks
        for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
            const weekStart = new Date(now - (weekOffset + 1) * 7 * 24 * 60 * 60 * 1000);
            const weekEnd = new Date(now - weekOffset * 7 * 24 * 60 * 60 * 1000);

            // Users who signed up in this week
            const { data: cohortUsers } = await supabase
                .from('users')
                .select('id, created_at')
                .gte('created_at', weekStart.toISOString())
                .lt('created_at', weekEnd.toISOString());

            const cohortSize = cohortUsers?.length || 0;
            if (cohortSize === 0) continue;

            const cohortUserIds = (cohortUsers || []).map(u => u.id);

            // Calculate retention for each subsequent week
            const weeklyRetention: number[] = [];
            for (let retentionWeek = 1; retentionWeek <= Math.min(weekOffset + 1, 6); retentionWeek++) {
                const retentionWeekStart = new Date(weekEnd.getTime() + (retentionWeek - 1) * 7 * 24 * 60 * 60 * 1000);
                const retentionWeekEnd = new Date(weekEnd.getTime() + retentionWeek * 7 * 24 * 60 * 60 * 1000);

                // Count users still active in that week
                const { count: activeInWeek } = await supabase
                    .from('user_stats')
                    .select('*', { count: 'exact', head: true })
                    .in('user_id', cohortUserIds)
                    .gte('last_activity', retentionWeekStart.toISOString())
                    .lt('last_activity', retentionWeekEnd.toISOString());

                const retentionRate = Math.round(((activeInWeek || 0) / cohortSize) * 100);
                weeklyRetention.push(retentionRate);
            }

            cohorts.push({
                cohort_week: `Week ${weekOffset + 1}`,
                week_start: weekStart.toISOString().split('T')[0],
                cohort_size: cohortSize,
                retention: weeklyRetention
            });
        }

        res.json({
            cohorts: cohorts.reverse(),
            weeks: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']
        });
    } catch (error) {
        console.error('Error fetching retention cohorts:', error);
        res.status(500).json({ error: 'Failed to fetch retention cohorts' });
    }
});

// GET /api/admin/analytics/ltv
// Returns lifetime value calculations by cohort
router.get('/analytics/ltv', async (req, res) => {
    try {
        const now = Date.now();
        const cohortLTV = [];

        // Get all payment orders with user info
        const { data: payments } = await supabase
            .from('payment_orders')
            .select('user_id, amount, paid_at')
            .eq('status', 'paid');

        // Get all users with their signup dates
        const { data: users } = await supabase
            .from('users')
            .select('id, created_at');

        // Group users by signup month
        const usersByMonth: Record<string, string[]> = {};
        (users || []).forEach((u: any) => {
            const month = new Date(u.created_at).toISOString().slice(0, 7); // YYYY-MM
            if (!usersByMonth[month]) usersByMonth[month] = [];
            usersByMonth[month].push(u.id);
        });

        // Calculate revenue per cohort
        const paymentsByUser: Record<string, number> = {};
        (payments || []).forEach((p: any) => {
            paymentsByUser[p.user_id] = (paymentsByUser[p.user_id] || 0) + parseFloat(p.amount || 0);
        });

        // Get total users and subscribers
        const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
        const { count: totalSubscribers } = await supabase.from('user_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active');

        const totalRevenue = Object.values(paymentsByUser).reduce((sum, val) => sum + val, 0);
        const avgRevenuePerUser = totalUsers ? totalRevenue / totalUsers : 0;
        const avgRevenuePerPaidUser = totalSubscribers ? totalRevenue / totalSubscribers : 0;

        // Calculate LTV by month cohort (last 6 months)
        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
            const monthDate = new Date(now);
            monthDate.setMonth(monthDate.getMonth() - monthOffset);
            const monthKey = monthDate.toISOString().slice(0, 7);

            const cohortUserIds = usersByMonth[monthKey] || [];
            const cohortSize = cohortUserIds.length;

            if (cohortSize === 0) continue;

            const cohortRevenue = cohortUserIds.reduce((sum, id) => sum + (paymentsByUser[id] || 0), 0);
            const paidUsers = cohortUserIds.filter(id => paymentsByUser[id] > 0).length;
            const conversionRate = Math.round((paidUsers / cohortSize) * 100);
            const ltv = cohortSize > 0 ? Math.round(cohortRevenue / cohortSize) : 0;
            const arppu = paidUsers > 0 ? Math.round(cohortRevenue / paidUsers) : 0;

            cohortLTV.push({
                month: monthKey,
                month_label: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                cohort_size: cohortSize,
                paid_users: paidUsers,
                conversion_rate: conversionRate,
                total_revenue: Math.round(cohortRevenue),
                ltv: ltv,
                arppu: arppu
            });
        }

        res.json({
            overall: {
                total_users: totalUsers || 0,
                total_revenue: Math.round(totalRevenue),
                avg_revenue_per_user: Math.round(avgRevenuePerUser),
                avg_revenue_per_paid_user: Math.round(avgRevenuePerPaidUser)
            },
            cohorts: cohortLTV.reverse()
        });
    } catch (error) {
        console.error('Error fetching LTV stats:', error);
        res.status(500).json({ error: 'Failed to fetch LTV stats' });
    }
});

// GET /api/admin/analytics/exam-coverage
// Returns exam coverage matrix (questions per topic per exam)
router.get('/analytics/exam-coverage', async (req, res) => {
    try {
        // Get all active exams
        const { data: exams } = await supabase
            .from('exams')
            .select('id, name')
            .eq('is_active', true)
            .order('name');

        // Get all subjects with their topics
        const { data: subjects } = await supabase
            .from('subjects')
            .select(`
                id,
                name,
                topics(id, name, question_count)
            `)
            .eq('is_active', true)
            .order('name');

        // Get question counts by topic and exam
        const { data: questionExamTopics } = await supabase
            .from('questions')
            .select('topic_id, exam_id')
            .eq('is_active', true);

        // Build coverage matrix
        const coverageByTopicExam: Record<string, Record<string, number>> = {};
        (questionExamTopics || []).forEach((q: any) => {
            if (!q.topic_id || !q.exam_id) return;
            if (!coverageByTopicExam[q.topic_id]) coverageByTopicExam[q.topic_id] = {};
            coverageByTopicExam[q.topic_id][q.exam_id] = (coverageByTopicExam[q.topic_id][q.exam_id] || 0) + 1;
        });

        // Format matrix data
        const matrix: any[] = [];
        (subjects || []).forEach((subject: any) => {
            (subject.topics || []).forEach((topic: any) => {
                const row: any = {
                    subject_name: subject.name,
                    topic_id: topic.id,
                    topic_name: topic.name,
                    total_questions: topic.question_count || 0,
                    exams: {}
                };

                (exams || []).forEach((exam: any) => {
                    row.exams[exam.id] = coverageByTopicExam[topic.id]?.[exam.id] || 0;
                });

                // Calculate coverage gaps
                const examCounts = Object.values(row.exams) as number[];
                const hasGap = examCounts.some((count: number) => count === 0);
                const avgPerExam = examCounts.length > 0
                    ? Math.round(examCounts.reduce((a: number, b: number) => a + b, 0) / examCounts.length)
                    : 0;

                row.has_gap = hasGap;
                row.avg_per_exam = avgPerExam;
                matrix.push(row);
            });
        });

        // Sort by gaps first, then by lowest average
        matrix.sort((a, b) => {
            if (a.has_gap !== b.has_gap) return a.has_gap ? -1 : 1;
            return a.avg_per_exam - b.avg_per_exam;
        });

        res.json({
            exams: (exams || []).map((e: any) => ({ id: e.id, name: e.name })),
            matrix: matrix.slice(0, 50) // Limit to top 50 topics
        });
    } catch (error) {
        console.error('Error fetching exam coverage:', error);
        res.status(500).json({ error: 'Failed to fetch exam coverage' });
    }
});

// GET /api/admin/analytics/test-performance
// Returns test performance metrics and topic-level analytics
router.get('/analytics/test-performance', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Total test attempts
        const { count: totalAttempts } = await supabase
            .from('test_attempts')
            .select('*', { count: 'exact', head: true });

        // Get all completed attempts for stats
        const { data: attempts } = await supabase
            .from('test_attempts')
            .select('score, total_questions, percentage, time_taken_seconds, test_id')
            .not('completed_at', 'is', null);

        const avgScore = attempts && attempts.length > 0
            ? Math.round(attempts.reduce((sum: number, a: any) => sum + (a.percentage || 0), 0) / attempts.length)
            : 0;

        const avgCompletionTime = attempts && attempts.length > 0
            ? Math.round(attempts.reduce((sum: number, a: any) => sum + ((a.time_taken_seconds || 0) / 60), 0) / attempts.length)
            : 0;

        const passedAttempts = attempts?.filter((a: any) => (a.percentage || 0) >= 60).length || 0;
        const passRate = attempts && attempts.length > 0
            ? Math.round((passedAttempts / attempts.length) * 100)
            : 0;

        // Tests by category with avg score
        const { data: testsWithCategory } = await supabase
            .from('test_attempts')
            .select(`
                percentage,
                tests!inner(
                    test_category_id,
                    test_category:test_categories(name)
                )
            `)
            .not('completed_at', 'is', null);

        const categoryStats: Record<string, { count: number; totalScore: number }> = {};
        (testsWithCategory || []).forEach((t: any) => {
            const catName = t.tests?.test_category?.name || 'Uncategorized';
            if (!categoryStats[catName]) {
                categoryStats[catName] = { count: 0, totalScore: 0 };
            }
            categoryStats[catName].count++;
            categoryStats[catName].totalScore += t.percentage || 0;
        });

        const testsByCategory = Object.entries(categoryStats).map(([category, stats]) => ({
            category,
            count: stats.count,
            avg_score: Math.round(stats.totalScore / stats.count)
        }));

        // Difficulty performance
        const { data: userAnswers } = await supabase
            .from('user_answers')
            .select(`
                is_correct,
                questions!inner(difficulty)
            `);

        const difficultyStats: Record<string, { correct: number; total: number }> = {
            easy: { correct: 0, total: 0 },
            medium: { correct: 0, total: 0 },
            hard: { correct: 0, total: 0 }
        };

        (userAnswers || []).forEach((a: any) => {
            const diff = a.questions?.difficulty || 'medium';
            if (difficultyStats[diff]) {
                difficultyStats[diff].total++;
                if (a.is_correct) difficultyStats[diff].correct++;
            }
        });

        const difficultyPerformance = {
            easy: difficultyStats.easy.total > 0
                ? Math.round((difficultyStats.easy.correct / difficultyStats.easy.total) * 100) : 0,
            medium: difficultyStats.medium.total > 0
                ? Math.round((difficultyStats.medium.correct / difficultyStats.medium.total) * 100) : 0,
            hard: difficultyStats.hard.total > 0
                ? Math.round((difficultyStats.hard.correct / difficultyStats.hard.total) * 100) : 0
        };

        // Topic performance (aggregate from user_answers)
        const { data: topicAnswers } = await supabase
            .from('user_answers')
            .select(`
                is_correct,
                questions!inner(
                    topic_id,
                    topics!inner(name)
                )
            `);

        const topicStats: Record<string, { name: string; correct: number; total: number }> = {};
        (topicAnswers || []).forEach((a: any) => {
            const topicId = a.questions?.topic_id;
            const topicName = a.questions?.topics?.name || 'Unknown';
            if (topicId) {
                if (!topicStats[topicId]) {
                    topicStats[topicId] = { name: topicName, correct: 0, total: 0 };
                }
                topicStats[topicId].total++;
                if (a.is_correct) topicStats[topicId].correct++;
            }
        });

        const allTopics = Object.entries(topicStats)
            .map(([id, stats]) => ({
                topic_name: stats.name,
                avg_score: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
                attempts: stats.total
            }))
            .filter(t => t.attempts >= 5); // Only topics with significant attempts

        const topPerformingTopics = [...allTopics]
            .sort((a, b) => b.avg_score - a.avg_score)
            .slice(0, 5);

        const strugglingTopics = [...allTopics]
            .sort((a, b) => a.avg_score - b.avg_score)
            .slice(0, 5);

        // Attempts trend (last 30 days)
        const { data: recentAttempts } = await supabase
            .from('test_attempts')
            .select('started_at, percentage')
            .gt('started_at', thirtyDaysAgo)
            .not('completed_at', 'is', null);

        const attemptsByDay: Record<string, { count: number; totalScore: number }> = {};
        (recentAttempts || []).forEach((a: any) => {
            const date = new Date(a.started_at).toISOString().split('T')[0];
            if (!attemptsByDay[date]) {
                attemptsByDay[date] = { count: 0, totalScore: 0 };
            }
            attemptsByDay[date].count++;
            attemptsByDay[date].totalScore += a.percentage || 0;
        });

        const attemptsTrend = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            const dayStats = attemptsByDay[dateStr];
            attemptsTrend.push({
                date: dateStr,
                count: dayStats?.count || 0,
                avg_score: dayStats && dayStats.count > 0
                    ? Math.round(dayStats.totalScore / dayStats.count) : 0
            });
        }

        // Topic heatmap data (all topics with minimum attempts)
        const topicHeatmap = Object.entries(topicStats)
            .map(([id, stats]) => ({
                topic_id: id,
                topic_name: stats.name,
                accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
                attempts: stats.total
            }))
            .filter(t => t.attempts >= 3)
            .sort((a, b) => a.topic_name.localeCompare(b.topic_name));

        res.json({
            total_attempts: totalAttempts || 0,
            avg_score: avgScore,
            avg_completion_time_mins: avgCompletionTime,
            pass_rate: passRate,
            tests_by_category: testsByCategory,
            difficulty_performance: difficultyPerformance,
            top_performing_topics: topPerformingTopics,
            struggling_topics: strugglingTopics,
            attempts_trend: attemptsTrend,
            topic_heatmap: topicHeatmap
        });
    } catch (error) {
        console.error('Error fetching test performance stats:', error);
        res.status(500).json({ error: 'Failed to fetch test performance stats' });
    }
});

// GET /api/admin/analytics/feature-adoption
// Returns adoption metrics for Marathon, Daily Practice, Custom Tests, etc.
router.get('/analytics/feature-adoption', async (req, res) => {
    try {
        // Marathon stats
        const { count: totalMarathonSessions } = await supabase
            .from('marathon_sessions')
            .select('*', { count: 'exact', head: true });

        const { count: activeMarathonSessions } = await supabase
            .from('marathon_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        const { data: marathonData } = await supabase
            .from('marathon_sessions')
            .select('questions_mastered, total_questions')
            .eq('status', 'completed');

        let avgMasteryRate = 0;
        let totalMastered = 0;
        if (marathonData && marathonData.length > 0) {
            totalMastered = marathonData.reduce((sum: number, m: any) => sum + (m.questions_mastered || 0), 0);
            const totalQuestions = marathonData.reduce((sum: number, m: any) => sum + (m.total_questions || 1), 0);
            avgMasteryRate = totalQuestions > 0 ? Math.round((totalMastered / totalQuestions) * 100) : 0;
        }

        // Daily Practice stats
        const { count: totalDailySessions } = await supabase
            .from('daily_practice_sessions')
            .select('*', { count: 'exact', head: true });

        const { data: dailyData } = await supabase
            .from('daily_practice_sessions')
            .select('questions_answered, total_questions')
            .eq('status', 'completed');

        let avgDailyCompletionRate = 0;
        if (dailyData && dailyData.length > 0) {
            const totalAnswered = dailyData.reduce((sum: number, d: any) => sum + (d.questions_answered || 0), 0);
            const totalQ = dailyData.reduce((sum: number, d: any) => sum + (d.total_questions || 1), 0);
            avgDailyCompletionRate = totalQ > 0 ? Math.round((totalAnswered / totalQ) * 100) : 0;
        }

        const { count: usersWithDailyConfig } = await supabase
            .from('daily_practice_config')
            .select('*', { count: 'exact', head: true });

        // Custom Tests stats
        const { count: totalCustomTests } = await supabase
            .from('custom_tests')
            .select('*', { count: 'exact', head: true });

        const { count: completedCustomTests } = await supabase
            .from('custom_tests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'completed');

        const { data: customTestData } = await supabase
            .from('custom_tests')
            .select('total_questions');

        const avgQuestionsPerCustomTest = customTestData && customTestData.length > 0
            ? Math.round(customTestData.reduce((sum: number, t: any) => sum + (t.total_questions || 0), 0) / customTestData.length)
            : 0;

        // Saved Questions stats
        const { count: totalSavedQuestions } = await supabase
            .from('saved_questions')
            .select('*', { count: 'exact', head: true });

        const { data: userSaves } = await supabase
            .from('saved_questions')
            .select('user_id');

        const uniqueUsersWithSaves = new Set((userSaves || []).map((s: any) => s.user_id)).size;

        // Mistakes Practice stats
        const { count: totalMistakes } = await supabase
            .from('user_mistakes')
            .select('*', { count: 'exact', head: true });

        const { count: resolvedMistakes } = await supabase
            .from('user_mistakes')
            .select('*', { count: 'exact', head: true })
            .eq('is_resolved', true);

        const resolutionRate = totalMistakes && totalMistakes > 0
            ? Math.round(((resolvedMistakes || 0) / totalMistakes) * 100)
            : 0;

        res.json({
            marathon: {
                total_sessions: totalMarathonSessions || 0,
                active_sessions: activeMarathonSessions || 0,
                avg_mastery_rate: avgMasteryRate,
                total_questions_mastered: totalMastered
            },
            daily_practice: {
                total_sessions: totalDailySessions || 0,
                avg_completion_rate: avgDailyCompletionRate,
                users_with_config: usersWithDailyConfig || 0
            },
            custom_tests: {
                total_created: totalCustomTests || 0,
                completed_count: completedCustomTests || 0,
                avg_questions_per_test: avgQuestionsPerCustomTest
            },
            saved_questions: {
                total_saved: totalSavedQuestions || 0,
                users_with_saves: uniqueUsersWithSaves
            },
            mistakes_practice: {
                total_tracked: totalMistakes || 0,
                resolved_count: resolvedMistakes || 0,
                resolution_rate: resolutionRate
            }
        });
    } catch (error) {
        console.error('Error fetching feature adoption stats:', error);
        res.status(500).json({ error: 'Failed to fetch feature adoption stats' });
    }
});

// GET /api/admin/analytics/promo-performance
// Returns promo code usage and revenue impact
router.get('/analytics/promo-performance', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Total and active promo codes
        const { count: totalCodes } = await supabase
            .from('promo_codes')
            .select('*', { count: 'exact', head: true });

        const { count: activeCodes } = await supabase
            .from('promo_codes')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .gt('end_date', new Date().toISOString());

        // Total redemptions
        const { count: totalRedemptions } = await supabase
            .from('promo_code_usages')
            .select('*', { count: 'exact', head: true });

        // Total discount given
        const { data: usages } = await supabase
            .from('promo_code_usages')
            .select('discount_applied');

        const totalDiscountGiven = (usages || []).reduce((sum: number, u: any) =>
            sum + parseFloat(u.discount_applied || 0), 0);

        // Conversion rate (usage that led to successful payment)
        const { count: successfulPayments } = await supabase
            .from('payment_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'paid')
            .not('promo_code_id', 'is', null);

        const conversionRate = totalRedemptions && totalRedemptions > 0
            ? Math.round(((successfulPayments || 0) / totalRedemptions) * 100)
            : 0;

        // Top codes by usage
        const { data: promoCodes } = await supabase
            .from('promo_codes')
            .select('id, code, current_uses');

        // Get revenue generated by promo code
        const { data: promoPayments } = await supabase
            .from('payment_orders')
            .select('promo_code_id, amount')
            .eq('status', 'paid')
            .not('promo_code_id', 'is', null);

        const revenueByCode: Record<string, number> = {};
        (promoPayments || []).forEach((p: any) => {
            if (p.promo_code_id) {
                revenueByCode[p.promo_code_id] = (revenueByCode[p.promo_code_id] || 0) + parseFloat(p.amount || 0);
            }
        });

        const topCodes = (promoCodes || [])
            .map((p: any) => ({
                code: p.code,
                uses: p.current_uses || 0,
                revenue_generated: revenueByCode[p.id] || 0
            }))
            .sort((a, b) => b.uses - a.uses)
            .slice(0, 10);

        // Usage trend (last 30 days)
        const { data: recentUsages } = await supabase
            .from('promo_code_usages')
            .select('used_at')
            .gt('used_at', thirtyDaysAgo);

        const usageByDay: Record<string, number> = {};
        (recentUsages || []).forEach((u: any) => {
            const date = new Date(u.used_at).toISOString().split('T')[0];
            usageByDay[date] = (usageByDay[date] || 0) + 1;
        });

        const usageTrend = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            usageTrend.push({
                date: dateStr,
                uses: usageByDay[dateStr] || 0
            });
        }

        res.json({
            total_codes: totalCodes || 0,
            active_codes: activeCodes || 0,
            total_redemptions: totalRedemptions || 0,
            total_discount_given: Math.round(totalDiscountGiven * 100) / 100,
            conversion_rate: conversionRate,
            top_codes: topCodes,
            usage_trend: usageTrend
        });
    } catch (error) {
        console.error('Error fetching promo performance stats:', error);
        res.status(500).json({ error: 'Failed to fetch promo performance stats' });
    }
});

// GET /api/admin/analytics/user-growth
// Returns enhanced user growth metrics
router.get('/analytics/user-growth', async (req, res) => {
    try {
        const now = Date.now();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

        // Total users
        const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        // New today
        const { count: newToday } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', oneDayAgo);

        // New this week
        const { count: newThisWeek } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', sevenDaysAgo);

        // New this month
        const { count: newThisMonth } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', thirtyDaysAgo);

        // Previous week for growth rate
        const { count: previousWeek } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', fourteenDaysAgo)
            .lt('created_at', sevenDaysAgo);

        const growthRateWeekly = previousWeek && previousWeek > 0
            ? Math.round((((newThisWeek || 0) - previousWeek) / previousWeek) * 100)
            : 0;

        // Previous month for growth rate
        const { count: previousMonth } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', sixtyDaysAgo)
            .lt('created_at', thirtyDaysAgo);

        const growthRateMonthly = previousMonth && previousMonth > 0
            ? Math.round((((newThisMonth || 0) - previousMonth) / previousMonth) * 100)
            : 0;

        // Users by target exam
        const { data: usersByExam } = await supabase
            .from('users')
            .select(`
                target_exam_id,
                exams!users_target_exam_id_fkey(name)
            `)
            .not('target_exam_id', 'is', null);

        const examCounts: Record<string, { name: string; count: number }> = {};
        (usersByExam || []).forEach((u: any) => {
            const examId = u.target_exam_id;
            const examName = u.exams?.name || 'Unknown';
            if (!examCounts[examId]) {
                examCounts[examId] = { name: examName, count: 0 };
            }
            examCounts[examId].count++;
        });

        const byTargetExam = Object.values(examCounts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Daily signups trend (last 30 days)
        const { data: recentUsers } = await supabase
            .from('users')
            .select('created_at')
            .gt('created_at', thirtyDaysAgo);

        const signupsByDay: Record<string, number> = {};
        (recentUsers || []).forEach((u: any) => {
            const date = new Date(u.created_at).toISOString().split('T')[0];
            signupsByDay[date] = (signupsByDay[date] || 0) + 1;
        });

        const dailySignups = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            dailySignups.push({
                date: dateStr,
                count: signupsByDay[dateStr] || 0
            });
        }

        res.json({
            total_users: totalUsers || 0,
            new_today: newToday || 0,
            new_this_week: newThisWeek || 0,
            new_this_month: newThisMonth || 0,
            growth_rate_weekly: growthRateWeekly,
            growth_rate_monthly: growthRateMonthly,
            by_target_exam: byTargetExam,
            daily_signups: dailySignups
        });
    } catch (error) {
        console.error('Error fetching user growth stats:', error);
        res.status(500).json({ error: 'Failed to fetch user growth stats' });
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

        // Pending tickets (open or in_progress) with details for table
        const { data: pendingTickets } = await supabase
            .from('support_tickets')
            .select(`
                id,
                issue_type,
                message,
                status,
                created_at,
                users!inner(name, email)
            `)
            .in('status', ['open', 'in_progress'])
            .order('created_at', { ascending: true })
            .limit(10);

        const pendingTicketsList = (pendingTickets || []).map((t: any) => {
            const createdAt = new Date(t.created_at);
            const ageHours = Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
            const ageDisplay = ageHours < 24 ? `${ageHours}h` : `${Math.round(ageHours / 24)}d`;
            return {
                id: t.id,
                ticket_number: `#${t.id.slice(0, 8).toUpperCase()}`,
                user_name: t.users?.name || 'Unknown',
                user_email: t.users?.email || '',
                issue_type: t.issue_type,
                message: t.message?.slice(0, 100) + (t.message?.length > 100 ? '...' : ''),
                status: t.status,
                age: ageDisplay,
                age_hours: ageHours,
                created_at: t.created_at
            };
        });

        // Ticket trend (last 30 days)
        const { data: ticketTrendData } = await supabase
            .from('support_tickets')
            .select('created_at')
            .gt('created_at', thirtyDaysAgo);

        const ticketsByDay: Record<string, number> = {};
        (ticketTrendData || []).forEach((t: any) => {
            const date = new Date(t.created_at).toISOString().split('T')[0];
            ticketsByDay[date] = (ticketsByDay[date] || 0) + 1;
        });

        const ticketTrend = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            ticketTrend.push({
                date: dateStr,
                count: ticketsByDay[dateStr] || 0
            });
        }

        res.json({
            total_tickets: totalTickets || 0,
            open_tickets: openTickets || 0,
            in_progress_tickets: inProgressTickets || 0,
            resolved_tickets: resolvedTickets || 0,
            tickets_by_type: typeCount,
            recent_tickets_7d: recentTickets || 0,
            avg_resolution_hours: avgResolutionHours,
            pending_tickets: pendingTicketsList,
            ticket_trend: ticketTrend
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

// =====================================================
// AI QUESTION GENERATION
// =====================================================

import {
    generateQuestions as aiGenerateQuestions,
    translateQuestion as aiTranslateQuestion,
    suggestConcepts as aiSuggestConcepts,
    checkForDuplicates,
    generateContentHash,
    testConnection as testOpenAIConnection
} from '../services/openai';

// --- ADMIN SETTINGS ---

// GET /api/admin/settings/:key - Get a setting value
router.get('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params;

        // Don't return API key value directly
        if (key === 'openai_api_key') {
            const { data } = await supabase
                .from('admin_settings')
                .select('setting_value')
                .eq('setting_key', key)
                .single();

            return res.json({
                key,
                isConfigured: !!(data?.setting_value),
                value: data?.setting_value ? '••••••••' : null
            });
        }

        const { data, error } = await supabase
            .from('admin_settings')
            .select('*')
            .eq('setting_key', key)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        res.json(data || { key, value: null });
    } catch (error) {
        console.error('Error fetching setting:', error);
        res.status(500).json({ error: 'Failed to fetch setting' });
    }
});

// PUT /api/admin/settings/:key - Update a setting
router.put('/settings/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        const userId = (req as any).user?.id;

        const { data, error } = await supabase
            .from('admin_settings')
            .upsert({
                setting_key: key,
                setting_value: value,
                is_encrypted: key === 'openai_api_key',
                updated_at: new Date().toISOString(),
                updated_by: userId
            }, { onConflict: 'setting_key' })
            .select()
            .single();

        if (error) throw error;

        // Return masked value for sensitive keys
        if (key === 'openai_api_key') {
            return res.json({
                success: true,
                isConfigured: !!value
            });
        }

        res.json(data);
    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

// POST /api/admin/settings/test-openai - Test OpenAI connection
router.post('/settings/test-openai', async (req, res) => {
    try {
        const isConnected = await testOpenAIConnection();
        res.json({ success: isConnected });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- AI QUESTION GENERATION ---

// POST /api/admin/questions/generate-ai - Generate questions using AI
router.post('/questions/generate-ai', async (req, res) => {
    try {
        const {
            topic_id,
            concept_ids,
            language_ids,
            difficulty_distribution,
            count,
            custom_instructions
        } = req.body;

        // Validate inputs
        if (!topic_id || !concept_ids?.length || !language_ids?.length) {
            return res.status(400).json({
                error: 'topic_id, concept_ids, and language_ids are required'
            });
        }

        // Fetch topic info
        const { data: topic, error: topicError } = await supabase
            .from('topics')
            .select('id, name, subject_id')
            .eq('id', topic_id)
            .single();

        if (topicError || !topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        // Fetch concepts
        const { data: concepts } = await supabase
            .from('concepts')
            .select('id, name, description')
            .in('id', concept_ids);

        // Fetch languages
        const { data: languages } = await supabase
            .from('languages')
            .select('id, code, name')
            .in('id', language_ids);

        if (!concepts?.length || !languages?.length) {
            return res.status(400).json({ error: 'Invalid concepts or languages' });
        }

        // Fetch existing questions for duplicate prevention
        const { data: existingQuestions } = await supabase
            .from('questions')
            .select('id')
            .eq('topic_id', topic_id)
            .limit(50);

        let existingTexts: string[] = [];
        if (existingQuestions?.length) {
            const { data: translations } = await supabase
                .from('question_translations')
                .select('question_text')
                .in('question_id', existingQuestions.map(q => q.id))
                .limit(50);
            existingTexts = translations?.map(t => t.question_text) || [];
        }

        // Generate questions
        const result = await aiGenerateQuestions({
            topicName: topic.name,
            concepts: concepts,
            languages: languages,
            difficultyDistribution: difficulty_distribution || { easy: 30, medium: 50, hard: 20 },
            count: count || 10,
            customInstructions: custom_instructions,
            existingQuestions: existingTexts
        });

        // Process and save generated questions
        const savedQuestions: any[] = [];
        const warnings: string[] = [];
        const primaryLanguage = languages.find(l => l.code === 'en') || languages[0];
        const primaryQuestions = result.questions[primaryLanguage.code] || [];

        for (let i = 0; i < primaryQuestions.length; i++) {
            const primaryQ = primaryQuestions[i];

            // Check for duplicates
            const duplicates = await checkForDuplicates(primaryQ.question_text, topic_id);
            if (duplicates.length > 0) {
                warnings.push(`Question ${i + 1} may be similar to existing question: "${duplicates[0].questionText.substring(0, 50)}..."`);
            }

            // Create question
            const contentHash = generateContentHash(primaryQ.question_text);
            const { data: newQuestion, error: qError } = await supabase
                .from('questions')
                .insert({
                    topic_id,
                    difficulty: primaryQ.difficulty,
                    correct_answer_index: primaryQ.correct_answer_index,
                    is_ai_generated: true,
                    is_verified: false,
                    content_hash: contentHash,
                    is_active: true
                })
                .select()
                .single();

            if (qError || !newQuestion) {
                warnings.push(`Failed to save question ${i + 1}`);
                continue;
            }

            // Create translations for all languages
            for (const lang of languages) {
                const langQuestions = result.questions[lang.code];
                if (!langQuestions || !langQuestions[i]) continue;

                const langQ = langQuestions[i];
                await supabase.from('question_translations').insert({
                    question_id: newQuestion.id,
                    language_id: lang.id,
                    question_text: langQ.question_text,
                    options: langQ.options,
                    explanation: langQ.explanation
                });
            }

            // Link concepts
            const conceptsToLink = primaryQ.concept_ids?.length
                ? primaryQ.concept_ids
                : concept_ids.slice(0, 2); // Default to first 2 selected concepts

            for (let j = 0; j < conceptsToLink.length; j++) {
                await supabase.from('question_concepts').insert({
                    question_id: newQuestion.id,
                    concept_id: conceptsToLink[j],
                    is_primary: j === 0
                });
            }

            savedQuestions.push(newQuestion);
        }

        res.json({
            success: true,
            generated: savedQuestions.length,
            requested: count || 10,
            question_ids: savedQuestions.map(q => q.id),
            warnings
        });
    } catch (error: any) {
        console.error('Error generating AI questions:', error);
        res.status(500).json({ error: error.message || 'Failed to generate questions' });
    }
});

// POST /api/admin/questions/:id/translate - Add translation to existing question
router.post('/questions/:id/translate', async (req, res) => {
    try {
        const { id } = req.params;
        const { language_id } = req.body;

        if (!language_id) {
            return res.status(400).json({ error: 'language_id is required' });
        }

        // Check if translation already exists
        const { data: existing } = await supabase
            .from('question_translations')
            .select('id')
            .eq('question_id', id)
            .eq('language_id', language_id)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'Translation already exists for this language' });
        }

        // Get source translation (prefer English)
        const { data: sourceTranslation } = await supabase
            .from('question_translations')
            .select('*, language:languages(code, name)')
            .eq('question_id', id)
            .order('language_id')
            .limit(1)
            .single();

        if (!sourceTranslation) {
            return res.status(404).json({ error: 'No source translation found' });
        }

        // Get target language
        const { data: targetLang } = await supabase
            .from('languages')
            .select('id, code, name')
            .eq('id', language_id)
            .single();

        if (!targetLang) {
            return res.status(404).json({ error: 'Target language not found' });
        }

        // Translate using AI
        const translated = await aiTranslateQuestion({
            questionText: sourceTranslation.question_text,
            options: sourceTranslation.options,
            explanation: sourceTranslation.explanation || '',
            targetLanguage: { code: targetLang.code, name: targetLang.name }
        });

        // Save translation
        const { data: newTranslation, error } = await supabase
            .from('question_translations')
            .insert({
                question_id: id,
                language_id,
                question_text: translated.question_text,
                options: translated.options,
                explanation: translated.explanation
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            translation: newTranslation
        });
    } catch (error: any) {
        console.error('Error translating question:', error);
        res.status(500).json({ error: error.message || 'Failed to translate question' });
    }
});

// POST /api/admin/questions/:id/suggest-concepts - AI suggests concepts for question
router.post('/questions/:id/suggest-concepts', async (req, res) => {
    try {
        const { id } = req.params;

        // Get question with translation
        const { data: question } = await supabase
            .from('questions')
            .select('id, topic_id')
            .eq('id', id)
            .single();

        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const { data: translation } = await supabase
            .from('question_translations')
            .select('question_text, options')
            .eq('question_id', id)
            .limit(1)
            .single();

        if (!translation) {
            return res.status(404).json({ error: 'Question translation not found' });
        }

        // Get available concepts for this topic
        const { data: availableConcepts } = await supabase
            .from('concepts')
            .select('id, name, description')
            .eq('topic_id', question.topic_id)
            .eq('is_active', true);

        if (!availableConcepts?.length) {
            return res.json({ suggestions: [], message: 'No concepts available for this topic' });
        }

        // Get AI suggestions
        const suggestions = await aiSuggestConcepts(
            translation.question_text,
            translation.options,
            availableConcepts
        );

        res.json({
            suggestions: suggestions.map(s => ({
                ...s,
                concept: availableConcepts.find(c => c.id === s.concept_id)
            }))
        });
    } catch (error: any) {
        console.error('Error suggesting concepts:', error);
        res.status(500).json({ error: error.message || 'Failed to suggest concepts' });
    }
});

// PUT /api/admin/questions/:id/verify - Mark AI question as verified
router.put('/questions/:id/verify', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('questions')
            .update({ is_verified: true })
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Error verifying question:', error);
        res.status(500).json({ error: 'Failed to verify question' });
    }
});

// =====================================================
// --- SUBSCRIPTION PLAN MANAGEMENT ---
// =====================================================

// GET /api/admin/subscription-plans - Get all subscription plans
router.get('/subscription-plans', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('subscription_plans')
            .select('*')
            .order('price_monthly');

        if (error) throw error;

        // Enrich with subscriber counts
        const planIds = (data || []).map((p: any) => p.id);
        const { data: subscriptions } = await supabase
            .from('user_subscriptions')
            .select('plan_id, status, duration_type, is_recurring')
            .in('plan_id', planIds)
            .eq('status', 'active');

        // Count subscribers per plan
        const subscriberCounts: Record<string, { total: number; byDuration: Record<string, number>; recurring: number }> = {};
        (subscriptions || []).forEach((sub: any) => {
            if (!subscriberCounts[sub.plan_id]) {
                subscriberCounts[sub.plan_id] = { total: 0, byDuration: {}, recurring: 0 };
            }
            subscriberCounts[sub.plan_id].total++;
            subscriberCounts[sub.plan_id].byDuration[sub.duration_type] =
                (subscriberCounts[sub.plan_id].byDuration[sub.duration_type] || 0) + 1;
            if (sub.is_recurring) {
                subscriberCounts[sub.plan_id].recurring++;
            }
        });

        const enrichedPlans = (data || []).map((plan: any) => ({
            ...plan,
            active_subscribers: subscriberCounts[plan.id]?.total || 0,
            subscribers_by_duration: subscriberCounts[plan.id]?.byDuration || {},
            recurring_subscribers: subscriberCounts[plan.id]?.recurring || 0,
        }));

        res.json(enrichedPlans);
    } catch (error) {
        console.error('Error fetching subscription plans:', error);
        res.status(500).json({ error: 'Failed to fetch subscription plans' });
    }
});

// POST /api/admin/subscription-plans - Create a new subscription plan
router.post('/subscription-plans', async (req, res) => {
    try {
        const {
            name,
            price_monthly,
            price_3_months,
            price_6_months,
            price_yearly,
            features,
            tests_per_month,
            is_active = true
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Plan name is required' });
        }

        const { data, error } = await supabase
            .from('subscription_plans')
            .insert({
                name,
                price_monthly: price_monthly || 0,
                price_3_months: price_3_months || 0,
                price_6_months: price_6_months || 0,
                price_yearly: price_yearly || 0,
                features: features || [],
                tests_per_month,
                is_active
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Error creating subscription plan:', error);
        res.status(500).json({ error: 'Failed to create subscription plan' });
    }
});

// PUT /api/admin/subscription-plans/:id - Update a subscription plan
router.put('/subscription-plans/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            price_monthly,
            price_3_months,
            price_6_months,
            price_yearly,
            features,
            tests_per_month,
            is_active
        } = req.body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (price_monthly !== undefined) updateData.price_monthly = price_monthly;
        if (price_3_months !== undefined) updateData.price_3_months = price_3_months;
        if (price_6_months !== undefined) updateData.price_6_months = price_6_months;
        if (price_yearly !== undefined) updateData.price_yearly = price_yearly;
        if (features !== undefined) updateData.features = features;
        if (tests_per_month !== undefined) updateData.tests_per_month = tests_per_month;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data, error } = await supabase
            .from('subscription_plans')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error updating subscription plan:', error);
        res.status(500).json({ error: 'Failed to update subscription plan' });
    }
});

// DELETE /api/admin/subscription-plans/:id - Delete a subscription plan
router.delete('/subscription-plans/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if any users are subscribed to this plan
        const { count: subscriberCount } = await supabase
            .from('user_subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('plan_id', id)
            .eq('status', 'active');

        if (subscriberCount && subscriberCount > 0) {
            return res.status(400).json({
                error: `Cannot delete plan with ${subscriberCount} active subscriber(s). Deactivate the plan instead.`
            });
        }

        const { error } = await supabase
            .from('subscription_plans')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting subscription plan:', error);
        res.status(500).json({ error: 'Failed to delete subscription plan' });
    }
});

// GET /api/admin/subscriptions - Get all user subscriptions with filtering
router.get('/subscriptions', async (req, res) => {
    try {
        const { page = 1, limit = 20, status, plan_id, duration_type, is_recurring } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = supabase
            .from('user_subscriptions')
            .select(`
                *,
                plan:subscription_plans(id, name),
                user:users(id, email, full_name)
            `, { count: 'exact' })
            .order('started_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (status) query = query.eq('status', status);
        if (plan_id) query = query.eq('plan_id', plan_id);
        if (duration_type) query = query.eq('duration_type', duration_type);
        if (is_recurring !== undefined) query = query.eq('is_recurring', is_recurring === 'true');

        const { data, count, error } = await query;

        if (error) throw error;

        // Calculate days until expiry for each subscription
        const enrichedData = (data || []).map((sub: any) => {
            let daysUntilExpiry: number | null = null;
            if (sub.expires_at) {
                const expiryDate = new Date(sub.expires_at);
                const now = new Date();
                daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            }
            return {
                ...sub,
                days_until_expiry: daysUntilExpiry
            };
        });

        res.json({
            subscriptions: enrichedData,
            total: count,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil((count || 0) / Number(limit))
        });
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
});

// GET /api/admin/subscriptions/expiring - Get subscriptions expiring soon
router.get('/subscriptions/expiring', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + Number(days));

        const { data, error } = await supabase
            .from('user_subscriptions')
            .select(`
                *,
                plan:subscription_plans(id, name),
                user:users(id, email, full_name)
            `)
            .eq('status', 'active')
            .eq('is_recurring', false)
            .not('expires_at', 'is', null)
            .gt('expires_at', new Date().toISOString())
            .lte('expires_at', futureDate.toISOString())
            .order('expires_at', { ascending: true });

        if (error) throw error;

        const enrichedData = (data || []).map((sub: any) => {
            const expiryDate = new Date(sub.expires_at);
            const now = new Date();
            const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return {
                ...sub,
                days_until_expiry: daysUntilExpiry
            };
        });

        res.json(enrichedData);
    } catch (error) {
        console.error('Error fetching expiring subscriptions:', error);
        res.status(500).json({ error: 'Failed to fetch expiring subscriptions' });
    }
});

// GET /api/admin/analytics/subscription-duration-stats - Duration breakdown analytics
router.get('/analytics/subscription-duration-stats', async (req, res) => {
    try {
        // Get all active subscriptions with duration info
        const { data: subscriptions } = await supabase
            .from('user_subscriptions')
            .select('duration_type, is_recurring, plan_id')
            .eq('status', 'active');

        // Get plan info
        const { data: plans } = await supabase
            .from('subscription_plans')
            .select('id, name, price_monthly, price_3_months, price_6_months, price_yearly')
            .eq('is_active', true);

        const planMap: Record<string, any> = {};
        (plans || []).forEach((p: any) => {
            planMap[p.id] = p;
        });

        // Duration distribution
        const durationCounts: Record<string, number> = { '1_month': 0, '3_months': 0, '6_months': 0, '1_year': 0 };
        const recurringCounts = { recurring: 0, one_time: 0 };
        const revenueByDuration: Record<string, number> = { '1_month': 0, '3_months': 0, '6_months': 0, '1_year': 0 };

        (subscriptions || []).forEach((sub: any) => {
            const durationType = sub.duration_type || '1_month';
            durationCounts[durationType] = (durationCounts[durationType] || 0) + 1;

            if (sub.is_recurring) {
                recurringCounts.recurring++;
            } else {
                recurringCounts.one_time++;
            }

            // Estimate revenue
            const plan = planMap[sub.plan_id];
            if (plan) {
                const priceField = `price_${durationType === '1_year' ? 'yearly' : durationType}`;
                const price = plan[priceField] || plan.price_monthly || 0;
                revenueByDuration[durationType] = (revenueByDuration[durationType] || 0) + parseFloat(price);
            }
        });

        // Get recent payment orders with duration
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentPayments } = await supabase
            .from('payment_orders')
            .select('amount, duration, is_recurring, paid_at')
            .eq('status', 'paid')
            .gt('paid_at', thirtyDaysAgo);

        const durationTrend: Record<string, Record<string, number>> = {};
        (recentPayments || []).forEach((p: any) => {
            if (p.paid_at) {
                const date = new Date(p.paid_at).toISOString().split('T')[0];
                const dur = p.duration || '1_month';
                if (!durationTrend[date]) {
                    durationTrend[date] = { '1_month': 0, '3_months': 0, '6_months': 0, '1_year': 0 };
                }
                durationTrend[date][dur] = (durationTrend[date][dur] || 0) + 1;
            }
        });

        // Build trend chart data
        const trendData = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toISOString().split('T')[0];
            trendData.push({
                date: dateStr,
                ...durationTrend[dateStr] || { '1_month': 0, '3_months': 0, '6_months': 0, '1_year': 0 }
            });
        }

        res.json({
            duration_distribution: durationCounts,
            recurring_vs_onetime: recurringCounts,
            revenue_by_duration: revenueByDuration,
            duration_trend: trendData,
            total_active: (subscriptions || []).length
        });
    } catch (error) {
        console.error('Error fetching subscription duration stats:', error);
        res.status(500).json({ error: 'Failed to fetch subscription duration stats' });
    }
});

// POST /api/admin/subscriptions/:id/extend - Extend a subscription manually
router.post('/subscriptions/:id/extend', async (req, res) => {
    try {
        const { id } = req.params;
        const { days } = req.body;

        if (!days || days <= 0) {
            return res.status(400).json({ error: 'Valid number of days is required' });
        }

        // Get current subscription
        const { data: subscription, error: fetchError } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !subscription) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        // Calculate new expiry date
        const currentExpiry = subscription.expires_at ? new Date(subscription.expires_at) : new Date();
        const newExpiry = new Date(currentExpiry);
        newExpiry.setDate(newExpiry.getDate() + Number(days));

        const { data, error } = await supabase
            .from('user_subscriptions')
            .update({
                expires_at: newExpiry.toISOString(),
                status: 'active' // Reactivate if expired
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            subscription: data,
            message: `Subscription extended by ${days} days. New expiry: ${newExpiry.toISOString()}`
        });
    } catch (error) {
        console.error('Error extending subscription:', error);
        res.status(500).json({ error: 'Failed to extend subscription' });
    }
});

export default router;

