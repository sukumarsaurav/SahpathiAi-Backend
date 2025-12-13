
import { Router } from 'express';
// import { supabase } from '../db/supabase'; // Use admin if needed, but sticking to standard client usually
import { supabase, supabaseAdmin } from '../db/supabase';

const router = Router();

/**
 * GET /api/resources
 * List resources with optional filters
 */
router.get('/', async (req, res) => {
    try {
        const { exam_subject_id, topic_id, type } = req.query;

        // Build simpler query without problematic nested joins
        let query = supabaseAdmin
            .from('resources')
            .select('*')
            .order('created_at', { ascending: false });

        if (exam_subject_id) {
            query = query.eq('exam_subject_id', exam_subject_id);
        }
        if (topic_id) {
            query = query.eq('topic_id', topic_id);
        }
        if (type) {
            query = query.eq('type', type);
        }

        const { data: resources, error } = await query;

        if (error) {
            console.error('Resources query error:', error);
            throw error;
        }

        if (!resources || resources.length === 0) {
            return res.json([]);
        }

        // Fetch related data separately
        const examSubjectIds = [...new Set(resources.map(r => r.exam_subject_id).filter(Boolean))];
        const topicIds = [...new Set(resources.map(r => r.topic_id).filter(Boolean))];

        // Fetch exam_subjects with related data
        let examSubjectsMap: Record<string, any> = {};
        if (examSubjectIds.length > 0) {
            const { data: examSubjects } = await supabaseAdmin
                .from('exam_subjects')
                .select('id, subject_id, exam_id')
                .in('id', examSubjectIds);

            if (examSubjects) {
                // Get subject and exam details
                const subjectIds = [...new Set(examSubjects.map(es => es.subject_id).filter(Boolean))];
                const examIds = [...new Set(examSubjects.map(es => es.exam_id).filter(Boolean))];

                const [{ data: subjects }, { data: exams }] = await Promise.all([
                    supabaseAdmin.from('subjects').select('id, name').in('id', subjectIds),
                    supabaseAdmin.from('exams').select('id, name').in('id', examIds)
                ]);

                const subjectsMap = Object.fromEntries((subjects || []).map(s => [s.id, s]));
                const examsMap = Object.fromEntries((exams || []).map(e => [e.id, e]));

                examSubjects.forEach(es => {
                    examSubjectsMap[es.id] = {
                        id: es.id,
                        subject: subjectsMap[es.subject_id] || null,
                        exam: examsMap[es.exam_id] || null
                    };
                });
            }
        }

        // Fetch topics
        let topicsMap: Record<string, any> = {};
        if (topicIds.length > 0) {
            const { data: topics } = await supabaseAdmin
                .from('topics')
                .select('id, name')
                .in('id', topicIds);

            if (topics) {
                topics.forEach(t => {
                    topicsMap[t.id] = { id: t.id, name: t.name };
                });
            }
        }

        // Enrich resources with related data
        const enrichedResources = resources.map(r => ({
            ...r,
            exam_subject: r.exam_subject_id ? examSubjectsMap[r.exam_subject_id] || null : null,
            topic: r.topic_id ? topicsMap[r.topic_id] || null : null
        }));

        res.json(enrichedResources);
    } catch (error: any) {
        console.error('Get resources error:', error);
        res.status(500).json({ error: 'Failed to fetch resources', details: error?.message });
    }
});

/**
 * GET /api/resources/:id
 * Get a single resource by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: resource, error } = await supabaseAdmin
            .from('resources')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Fetch related data if present
        let exam_subject = null;
        let topic = null;

        if (resource.exam_subject_id) {
            const { data: es } = await supabaseAdmin
                .from('exam_subjects')
                .select('id, subject_id, exam_id')
                .eq('id', resource.exam_subject_id)
                .single();

            if (es) {
                const [{ data: subject }, { data: exam }] = await Promise.all([
                    supabaseAdmin.from('subjects').select('id, name').eq('id', es.subject_id).single(),
                    supabaseAdmin.from('exams').select('id, name').eq('id', es.exam_id).single()
                ]);
                exam_subject = { id: es.id, subject, exam };
            }
        }

        if (resource.topic_id) {
            const { data: t } = await supabaseAdmin
                .from('topics')
                .select('id, name')
                .eq('id', resource.topic_id)
                .single();
            topic = t;
        }

        res.json({ ...resource, exam_subject, topic });
    } catch (error) {
        console.error('Get resource error:', error);
        res.status(500).json({ error: 'Failed to fetch resource' });
    }
});

/**
 * POST /api/resources
 * Create a new resource
 */
router.post('/', async (req, res) => {
    try {
        const { exam_subject_id, topic_id, title, type, duration, url, language_id } = req.body;

        // Basic validation
        if (!title || !type) {
            return res.status(400).json({ error: 'Title and type are required' });
        }

        const { data, error } = await supabaseAdmin
            .from('resources')
            .insert({
                exam_subject_id,
                topic_id,
                title,
                type,
                duration,
                url,
                language_id
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        console.error('Create resource error:', error);
        res.status(500).json({ error: 'Failed to create resource' });
    }
});

/**
 * PUT /api/resources/:id
 * Update a resource
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const { data, error } = await supabaseAdmin
            .from('resources')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update resource error:', error);
        res.status(500).json({ error: 'Failed to update resource' });
    }
});

/**
 * DELETE /api/resources/:id
 * Delete a resource
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('resources')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Resource deleted successfully' });
    } catch (error) {
        console.error('Delete resource error:', error);
        res.status(500).json({ error: 'Failed to delete resource' });
    }
});

export default router;
