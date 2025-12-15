import express from 'express';
import { supabaseAdmin as supabase } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Generate ticket number
const generateTicketNumber = async (): Promise<string> => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // Get count of tickets today
    const { count } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().slice(0, 10));

    const counter = (count || 0) + 1;
    return `TKT-${today}-${counter.toString().padStart(4, '0')}`;
};

// POST /api/support/tickets - Create new support ticket
router.post('/tickets', async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { issue_type, subject, description } = req.body;

        if (!issue_type || !description) {
            return res.status(400).json({ error: 'Issue type and description are required' });
        }

        const ticketNumber = await generateTicketNumber();
        const ticketSubject = subject || `${issue_type} - Support Request`;

        // Create the ticket
        const { data: ticket, error } = await supabase
            .from('support_tickets')
            .insert({
                user_id: userId,
                ticket_number: ticketNumber,
                issue_type,
                subject: ticketSubject,
                description,
                status: 'open',
                priority: 'normal'
            })
            .select()
            .single();

        if (error) throw error;

        // Add the initial message
        const { error: msgError } = await supabase
            .from('support_messages')
            .insert({
                ticket_id: ticket.id,
                sender_id: userId,
                message: description,
                is_from_admin: false
            });

        if (msgError) console.error('Error creating initial message:', msgError);

        res.status(201).json(ticket);
    } catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({ error: 'Failed to create support ticket' });
    }
});

// GET /api/support/tickets - Get user's tickets
router.get('/tickets', async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { status, page = 1, limit = 10 } = req.query;

        let query = supabase
            .from('support_tickets')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        const offset = (Number(page) - 1) * Number(limit);
        query = query.range(offset, offset + Number(limit) - 1);

        const { data, error, count } = await query;

        if (error) throw error;

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

// GET /api/support/tickets/:id - Get single ticket with messages
router.get('/tickets/:id', async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        const { data: ticket, error } = await supabase
            .from('support_tickets')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
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

// POST /api/support/tickets/:id/messages - Send message to ticket
router.post('/tickets/:id/messages', async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Verify user owns the ticket
        const { data: ticket, error: ticketError } = await supabase
            .from('support_tickets')
            .select('id, status')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.status === 'closed') {
            return res.status(400).json({ error: 'Cannot send message to a closed ticket' });
        }

        // Create the message
        const { data: newMessage, error } = await supabase
            .from('support_messages')
            .insert({
                ticket_id: id,
                sender_id: userId,
                message,
                is_from_admin: false
            })
            .select(`
                *,
                sender:users(id, full_name, avatar_url, role)
            `)
            .single();

        if (error) throw error;

        // Update ticket updated_at
        await supabase
            .from('support_tickets')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', id);

        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// GET /api/support/tickets/:id/messages - Get ticket messages
router.get('/tickets/:id/messages', async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        // Verify user owns the ticket
        const { data: ticket, error: ticketError } = await supabase
            .from('support_tickets')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const { data: messages, error } = await supabase
            .from('support_messages')
            .select(`
                *,
                sender:users(id, full_name, avatar_url, role)
            `)
            .eq('ticket_id', id)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Mark admin messages as read
        await supabase
            .from('support_messages')
            .update({ is_read: true })
            .eq('ticket_id', id)
            .eq('is_from_admin', true)
            .eq('is_read', false);

        res.json(messages || []);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

export default router;
