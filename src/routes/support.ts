import express from 'express';
import { supabaseAdmin as supabase } from '../db/supabase';
import { authenticate } from '../middleware/auth';
import supportAiService from '../services/supportAiService';

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

        // Create the ticket with AI handler mode
        const { data: ticket, error } = await supabase
            .from('support_tickets')
            .insert({
                user_id: userId,
                ticket_number: ticketNumber,
                issue_type,
                subject: ticketSubject,
                description,
                status: 'open',
                priority: 'normal',
                handler_mode: 'ai' // Start with AI handling
            })
            .select()
            .single();

        if (error) throw error;

        // Add the initial user message
        const { error: msgError } = await supabase
            .from('support_messages')
            .insert({
                ticket_id: ticket.id,
                sender_id: userId,
                message: description,
                is_from_admin: false,
                message_type: 'user'
            });

        if (msgError) console.error('Error creating initial message:', msgError);

        // Generate AI welcome response based on issue type
        try {
            const welcomeMessage = supportAiService.getAIWelcomeMessage(issue_type);
            await supabase
                .from('support_messages')
                .insert({
                    ticket_id: ticket.id,
                    sender_id: userId, // AI uses same sender_id but different message_type
                    message: welcomeMessage,
                    is_from_admin: true,
                    message_type: 'ai',
                    ai_tokens_used: 0 // Welcome message uses no tokens
                });
        } catch (aiError) {
            console.error('Error generating AI welcome message:', aiError);
        }

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

// POST /api/support/tickets/:id/ai-response - Get AI response for a message
router.post('/tickets/:id/ai-response', async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Verify user owns the ticket and it's in AI mode
        const { data: ticket, error: ticketError } = await supabase
            .from('support_tickets')
            .select('id, issue_type, status, handler_mode')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.status === 'closed') {
            return res.status(400).json({ error: 'Cannot send message to a closed ticket' });
        }

        // Save user message first
        const { data: userMsg, error: userMsgError } = await supabase
            .from('support_messages')
            .insert({
                ticket_id: id,
                sender_id: userId,
                message,
                is_from_admin: false,
                message_type: 'user'
            })
            .select(`
                *,
                sender:users(id, full_name, avatar_url, role)
            `)
            .single();

        if (userMsgError) throw userMsgError;

        // Check if user explicitly wants human
        const wantsHuman = supportAiService.detectEscalationIntent(message);

        if (wantsHuman || ticket.handler_mode === 'human') {
            // User wants human, return transfer suggestion
            res.json({
                userMessage: userMsg,
                aiResponse: null,
                shouldTransfer: true,
                transferReason: 'User requested human agent'
            });
            return;
        }

        // Generate AI response
        const aiResult = await supportAiService.generateSupportResponse(
            id,
            message,
            ticket.issue_type
        );

        // Save AI response
        const { data: aiMsg, error: aiMsgError } = await supabase
            .from('support_messages')
            .insert({
                ticket_id: id,
                sender_id: userId,
                message: aiResult.message,
                is_from_admin: true,
                message_type: 'ai',
                ai_tokens_used: aiResult.tokensUsed
            })
            .select(`
                *,
                sender:users(id, full_name, avatar_url, role)
            `)
            .single();

        if (aiMsgError) throw aiMsgError;

        // Update ticket updated_at
        await supabase
            .from('support_tickets')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', id);

        res.json({
            userMessage: userMsg,
            aiResponse: aiMsg,
            shouldTransfer: aiResult.shouldEscalate,
            transferReason: aiResult.escalationReason,
            tokensUsed: aiResult.tokensUsed
        });
    } catch (error) {
        console.error('Error getting AI response:', error);
        res.status(500).json({ error: 'Failed to get AI response' });
    }
});

// POST /api/support/tickets/:id/transfer-to-human - Transfer ticket to human agent
router.post('/tickets/:id/transfer-to-human', async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { reason } = req.body;

        // Verify user owns the ticket
        const { data: ticket, error: ticketError } = await supabase
            .from('support_tickets')
            .select('id, status, handler_mode, ticket_number')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.status === 'closed') {
            return res.status(400).json({ error: 'Cannot transfer a closed ticket' });
        }

        if (ticket.handler_mode === 'human') {
            return res.status(400).json({ error: 'Ticket is already with a human agent' });
        }

        // Update ticket to hybrid mode and increase priority
        const { error: updateError } = await supabase
            .from('support_tickets')
            .update({
                handler_mode: 'hybrid',
                status: 'open', // Ensure it's open for human pickup
                priority: 'high', // Escalated tickets get high priority
                escalated_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) throw updateError;

        // Add system message about transfer
        const transferMessage = supportAiService.getTransferMessage();
        const { data: systemMsg, error: msgError } = await supabase
            .from('support_messages')
            .insert({
                ticket_id: id,
                sender_id: userId,
                message: transferMessage + (reason ? `\n\nReason: ${reason}` : ''),
                is_from_admin: true,
                message_type: 'system'
            })
            .select(`
                *,
                sender:users(id, full_name, avatar_url, role)
            `)
            .single();

        if (msgError) console.error('Error creating transfer message:', msgError);

        res.json({
            success: true,
            message: 'Ticket transferred to human support',
            ticketNumber: ticket.ticket_number,
            systemMessage: systemMsg
        });
    } catch (error) {
        console.error('Error transferring to human:', error);
        res.status(500).json({ error: 'Failed to transfer ticket' });
    }
});

export default router;
