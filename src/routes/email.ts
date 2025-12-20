import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { emailService } from '../services/emailService';

const router = Router();

// Middleware to check admin access
async function requireAdmin(req: any, res: any, next: any) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { data: userData } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (userData?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authentication failed' });
    }
}

// ===================================
// EMAIL SETTINGS
// ===================================

/**
 * GET /api/email/settings
 * Get current email settings
 */
router.get('/settings', requireAdmin, async (req, res) => {
    try {
        const settings = await emailService.getSettings();
        res.json(settings);
    } catch (error) {
        console.error('Get email settings error:', error);
        res.status(500).json({ error: 'Failed to get email settings' });
    }
});

/**
 * PUT /api/email/settings
 * Update email settings
 */
router.put('/settings', requireAdmin, async (req, res) => {
    try {
        const { provider, from_email, from_name, reply_to } = req.body;

        const settings = await emailService.updateSettings({
            provider,
            from_email,
            from_name,
            reply_to
        });

        res.json({ success: true, settings });
    } catch (error) {
        console.error('Update email settings error:', error);
        res.status(500).json({ error: 'Failed to update email settings' });
    }
});

// ===================================
// EMAIL TEMPLATES
// ===================================

/**
 * GET /api/email/templates
 * Get all email templates
 */
router.get('/templates', requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('email_templates')
            .select('*')
            .order('name');

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ error: 'Failed to get templates' });
    }
});

/**
 * GET /api/email/templates/:id
 * Get template by ID
 */
router.get('/templates/:id', requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('email_templates')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Template not found' });

        res.json(data);
    } catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ error: 'Failed to get template' });
    }
});

/**
 * POST /api/email/templates
 * Create new email template
 */
router.post('/templates', requireAdmin, async (req, res) => {
    try {
        const { name, subject, html_content, text_content, variables } = req.body;

        if (!name || !subject || !html_content) {
            return res.status(400).json({ error: 'Name, subject, and html_content are required' });
        }

        const { data, error } = await supabaseAdmin
            .from('email_templates')
            .insert({
                name,
                subject,
                html_content,
                text_content,
                variables: variables || []
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique violation
                return res.status(400).json({ error: 'Template name already exists' });
            }
            throw error;
        }

        res.status(201).json(data);
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

/**
 * PUT /api/email/templates/:id
 * Update email template
 */
router.put('/templates/:id', requireAdmin, async (req, res) => {
    try {
        const { name, subject, html_content, text_content, variables, is_active } = req.body;

        const { data, error } = await supabaseAdmin
            .from('email_templates')
            .update({
                name,
                subject,
                html_content,
                text_content,
                variables,
                is_active,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

/**
 * DELETE /api/email/templates/:id
 * Delete email template
 */
router.delete('/templates/:id', requireAdmin, async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from('email_templates')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

/**
 * POST /api/email/templates/:id/preview
 * Preview template with sample data
 */
router.post('/templates/:id/preview', requireAdmin, async (req, res) => {
    try {
        const { variables } = req.body;

        const { data: template, error } = await supabaseAdmin
            .from('email_templates')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // Render with provided variables
        const renderedSubject = emailService.renderTemplate(template.subject, variables || {});
        const renderedHtml = emailService.renderTemplate(template.html_content, variables || {});

        res.json({
            subject: renderedSubject,
            html: renderedHtml
        });
    } catch (error) {
        console.error('Preview template error:', error);
        res.status(500).json({ error: 'Failed to preview template' });
    }
});

/**
 * POST /api/email/templates/:id/test
 * Send test email to admin
 */
router.post('/templates/:id/test', requireAdmin, async (req, res) => {
    try {
        const { to, variables } = req.body;

        if (!to) {
            return res.status(400).json({ error: 'Recipient email is required' });
        }

        const { data: template, error: templateError } = await supabaseAdmin
            .from('email_templates')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (templateError || !template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // Render template
        const renderedSubject = `[TEST] ${emailService.renderTemplate(template.subject, variables || {})}`;
        const renderedHtml = emailService.renderTemplate(template.html_content, variables || {});

        // Send test email
        const result = await emailService.sendEmail({
            to,
            subject: renderedSubject,
            html: renderedHtml
        });

        if (result.success) {
            res.json({ success: true, messageId: result.messageId });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ error: 'Failed to send test email' });
    }
});

// ===================================
// EMAIL LOGS
// ===================================

/**
 * GET /api/email/logs
 * Get email logs with filtering
 */
router.get('/logs', requireAdmin, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            status,
            provider,
            from_date,
            to_date,
            search
        } = req.query;

        let query = supabaseAdmin
            .from('email_logs')
            .select('*', { count: 'exact' })
            .order('sent_at', { ascending: false });

        // Apply filters
        if (status) query = query.eq('status', status);
        if (provider) query = query.eq('provider', provider);
        if (from_date) query = query.gte('sent_at', from_date);
        if (to_date) query = query.lte('sent_at', to_date);
        if (search) query = query.ilike('recipient_email', `%${search}%`);

        // Pagination
        const offset = (Number(page) - 1) * Number(limit);
        query = query.range(offset, offset + Number(limit) - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            logs: data,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / Number(limit))
            }
        });
    } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({ error: 'Failed to get email logs' });
    }
});

/**
 * GET /api/email/stats
 * Get email statistics
 */
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        // Get counts by status
        const { data: statusCounts } = await supabaseAdmin
            .from('email_logs')
            .select('status')
            .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        // Get counts by provider
        const { data: providerCounts } = await supabaseAdmin
            .from('email_logs')
            .select('provider')
            .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        const stats = {
            last30Days: {
                total: statusCounts?.length || 0,
                sent: statusCounts?.filter(l => l.status === 'sent').length || 0,
                delivered: statusCounts?.filter(l => l.status === 'delivered').length || 0,
                failed: statusCounts?.filter(l => l.status === 'failed').length || 0,
                bounced: statusCounts?.filter(l => l.status === 'bounced').length || 0
            },
            byProvider: {
                resend: providerCounts?.filter(l => l.provider === 'resend').length || 0,
                smtp: providerCounts?.filter(l => l.provider === 'smtp').length || 0
            }
        };

        res.json(stats);
    } catch (error) {
        console.error('Get email stats error:', error);
        res.status(500).json({ error: 'Failed to get email statistics' });
    }
});

export default router;
