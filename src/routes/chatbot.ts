import { Router } from 'express';
import { supabaseAdmin } from '../db/supabase';
import { authenticate, optionalAuth } from '../middleware/auth';
import * as chatbotService from '../services/chatbot';

const router = Router();

/**
 * GET /api/chatbot/agents
 * Get all active chatbot agents (public)
 */
router.get('/agents', async (req, res) => {
    try {
        const agents = await chatbotService.getActiveAgents();
        res.json(agents);
    } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({ error: 'Failed to fetch chatbot agents' });
    }
});

/**
 * GET /api/chatbot/agents/:id
 * Get single agent details
 */
router.get('/agents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const agent = await chatbotService.getAgent(id);

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        res.json(agent);
    } catch (error) {
        console.error('Error fetching agent:', error);
        res.status(500).json({ error: 'Failed to fetch agent' });
    }
});

/**
 * POST /api/chatbot/conversations
 * Start a new conversation (authenticated users)
 */
router.post('/conversations', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;
        const { agent_id, language_id } = req.body;

        if (!agent_id) {
            return res.status(400).json({ error: 'agent_id is required' });
        }

        // Get agent to return welcome message
        const agent = await chatbotService.getAgent(agent_id);
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found or inactive' });
        }

        const conversationId = await chatbotService.getOrCreateConversation(
            userId,
            agent_id,
            language_id
        );

        res.json({
            conversation_id: conversationId,
            agent: {
                id: agent.id,
                name: agent.name,
                avatar_url: agent.avatar_url,
                welcome_message: agent.welcome_message
            }
        });
    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ error: 'Failed to start conversation' });
    }
});

/**
 * GET /api/chatbot/conversations/:id
 * Get conversation history
 */
router.get('/conversations/:id', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        // Verify user owns this conversation
        const { data: conversation, error: convError } = await supabaseAdmin
            .from('chat_conversations')
            .select(`
                *,
                agent:chatbot_agents(id, name, avatar_url, welcome_message)
            `)
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const messages = await chatbotService.getConversationHistory(id, 100);

        res.json({
            conversation,
            messages
        });
    } catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
});

/**
 * POST /api/chatbot/conversations/:id/messages
 * Send message and get AI response
 */
router.post('/conversations/:id/messages', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { message, language_id } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Verify user owns this conversation
        const { data: conversation, error: convError } = await supabaseAdmin
            .from('chat_conversations')
            .select('id, agent_id, status')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (conversation.status !== 'active') {
            return res.status(400).json({
                error: 'Conversation is not active',
                status: conversation.status
            });
        }

        // Generate AI response
        const response = await chatbotService.generateChatResponse(
            userId,
            conversation.agent_id,
            message.trim(),
            language_id
        );

        res.json({
            message: response.message,
            tokens_used: response.tokensUsed
        });
    } catch (error: any) {
        console.error('Error generating response:', error);
        res.status(500).json({ error: error.message || 'Failed to generate response' });
    }
});

/**
 * POST /api/chatbot/conversations/:id/escalate
 * Escalate to human support
 */
router.post('/conversations/:id/escalate', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        // Verify user owns this conversation
        const { data: conversation, error: convError } = await supabaseAdmin
            .from('chat_conversations')
            .select('id, status')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (conversation.status === 'escalated') {
            return res.status(400).json({ error: 'Conversation already escalated' });
        }

        const result = await chatbotService.escalateToHuman(id, userId);

        // TODO: Send real-time notification to admin (WebSocket/Push)
        // For now, we'll rely on the ticket system
        console.log(`[CHATBOT] Escalation created - Ticket: ${result.ticketNumber}`);

        res.json({
            success: true,
            ticket_number: result.ticketNumber,
            ticket_id: result.ticketId,
            message: `Your request has been escalated to our support team. Ticket number: ${result.ticketNumber}. We'll get back to you soon!`
        });
    } catch (error) {
        console.error('Error escalating conversation:', error);
        res.status(500).json({ error: 'Failed to escalate conversation' });
    }
});

/**
 * POST /api/chatbot/conversations/:id/close
 * Close a conversation
 */
router.post('/conversations/:id/close', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        // Verify user owns this conversation
        const { data: conversation, error: convError } = await supabaseAdmin
            .from('chat_conversations')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        await chatbotService.closeConversation(id);

        res.json({ success: true });
    } catch (error) {
        console.error('Error closing conversation:', error);
        res.status(500).json({ error: 'Failed to close conversation' });
    }
});

/**
 * GET /api/chatbot/my-conversations
 * Get user's chat history
 */
router.get('/my-conversations', authenticate, async (req, res) => {
    try {
        const userId = req.user!.id;

        const { data, error } = await supabaseAdmin
            .from('chat_conversations')
            .select(`
                id,
                status,
                message_count,
                started_at,
                last_message_at,
                agent:chatbot_agents(id, name, avatar_url)
            `)
            .eq('user_id', userId)
            .order('last_message_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Error fetching user conversations:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

/**
 * POST /api/chatbot/guest-inquiry
 * Submit inquiry for non-logged-in users
 */
router.post('/guest-inquiry', async (req, res) => {
    try {
        const { name, email, query, phone } = req.body;

        if (!name || !email || !query) {
            return res.status(400).json({
                error: 'Name, email, and query are required'
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const result = await chatbotService.createGuestInquiry(name, email, query, phone);

        res.json({
            success: true,
            inquiry_id: result.id,
            message: result.message
        });
    } catch (error) {
        console.error('Error creating guest inquiry:', error);
        res.status(500).json({ error: 'Failed to submit inquiry' });
    }
});

export default router;
