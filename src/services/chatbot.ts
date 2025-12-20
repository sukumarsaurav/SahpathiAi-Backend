import { supabaseAdmin } from '../db/supabase';

// Types
interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface ChatAgent {
    id: string;
    name: string;
    avatar_url: string | null;
    description: string | null;
    system_prompt: string;
    welcome_message: string;
    default_language_id: string | null;
    supported_language_ids: string[];
    personality_traits: Record<string, any>;
    policy_category_ids: string[] | null;
    is_active: boolean;
}

interface Policy {
    id: string;
    title: string;
    content: string;
    category: { name: string };
}

interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface ChatResponse {
    message: string;
    conversationId: string;
    tokensUsed: number;
}

/**
 * Fetch OpenAI API key from admin settings
 */
async function getApiKey(): Promise<string | null> {
    try {
        const { data, error } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', 'openai_api_key')
            .single();

        if (error || !data) return null;
        return data.setting_value;
    } catch {
        return null;
    }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(messages: OpenAIMessage[], maxTokens = 1000): Promise<{ content: string; tokensUsed: number }> {
    const apiKey = await getApiKey();
    if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please add it in Admin Settings.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.7,
            max_tokens: maxTokens
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(error.error?.message || 'OpenAI API request failed');
    }

    const data = await response.json() as {
        choices: { message: { content: string } }[];
        usage: { total_tokens: number };
    };

    return {
        content: data.choices[0].message.content,
        tokensUsed: data.usage.total_tokens
    };
}

/**
 * Get active chatbot agent by ID
 */
export async function getAgent(agentId: string): Promise<ChatAgent | null> {
    const { data, error } = await supabaseAdmin
        .from('chatbot_agents')
        .select('*')
        .eq('id', agentId)
        .eq('is_active', true)
        .single();

    if (error || !data) return null;
    return data as ChatAgent;
}

/**
 * Get all active chatbot agents
 */
export async function getActiveAgents(): Promise<ChatAgent[]> {
    const { data, error } = await supabaseAdmin
        .from('chatbot_agents')
        .select(`
            *,
            default_language:languages(id, code, name)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as ChatAgent[];
}

/**
 * Get policies for an agent (filtered by agent's category IDs)
 */
export async function getAgentPolicies(agent: ChatAgent, languageId?: string): Promise<Policy[]> {
    let query = supabaseAdmin
        .from('company_policies')
        .select(`
            id,
            title,
            content,
            category:policy_categories(name)
        `)
        .eq('is_active', true)
        .order('priority', { ascending: false });

    // Filter by agent's policy categories if specified
    if (agent.policy_category_ids && agent.policy_category_ids.length > 0) {
        query = query.in('category_id', agent.policy_category_ids);
    }

    // Filter by language if specified
    if (languageId) {
        query = query.or(`language_id.eq.${languageId},language_id.is.null`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Supabase returns category as object with name property
    return (data || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        category: p.category || { name: 'General' }
    })) as Policy[];
}

/**
 * Get knowledge documents for an agent
 */
export async function getAgentKnowledgeDocs(agentId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from('knowledge_documents')
        .select('extracted_content')
        .eq('agent_id', agentId)
        .eq('is_active', true)
        .eq('is_processed', true);

    if (error) throw error;
    return (data || []).map(d => d.extracted_content).filter(Boolean);
}

/**
 * Build system prompt with policies and knowledge
 */
export function buildSystemPrompt(
    agent: ChatAgent,
    policies: Policy[],
    knowledgeDocs: string[],
    languageName: string
): string {
    // Format policies
    const policiesContent = policies.length > 0
        ? policies.map(p => {
            const category = (p.category as any)?.name || 'General';
            return `### ${category}: ${p.title}\n${p.content}`;
        }).join('\n\n')
        : 'No specific policies available.';

    // Format knowledge documents
    const knowledgeContent = knowledgeDocs.length > 0
        ? knowledgeDocs.join('\n\n---\n\n')
        : '';

    // Build personality description
    const personalityDesc = Object.entries(agent.personality_traits || {})
        .filter(([_, v]) => v === true)
        .map(([k]) => k)
        .join(', ') || 'helpful and professional';

    return `${agent.system_prompt}

YOUR NAME: ${agent.name}

PERSONALITY:
- You are ${personalityDesc}
- You respond in ${languageName}

COMPANY POLICIES:
${policiesContent}

${knowledgeContent ? `ADDITIONAL KNOWLEDGE:\n${knowledgeContent}` : ''}

RULES:
1. Always be polite, helpful, and professional
2. If you don't know the answer or it's not in the policies, suggest contacting human support
3. Never make up information not in the policies or knowledge base
4. Keep responses concise but complete
5. Always respond in ${languageName}
6. If the user asks to talk to a human, acknowledge their request and let them know a support ticket will be created`;
}

/**
 * Get or create a conversation
 */
export async function getOrCreateConversation(
    userId: string,
    agentId: string,
    languageId?: string
): Promise<string> {
    // Check for active conversation
    const { data: existing } = await supabaseAdmin
        .from('chat_conversations')
        .select('id')
        .eq('user_id', userId)
        .eq('agent_id', agentId)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

    if (existing) return existing.id;

    // Create new conversation
    const { data: newConv, error } = await supabaseAdmin
        .from('chat_conversations')
        .insert({
            user_id: userId,
            agent_id: agentId,
            language_id: languageId,
            status: 'active'
        })
        .select('id')
        .single();

    if (error) throw error;
    return newConv.id;
}

/**
 * Get conversation history
 */
export async function getConversationHistory(conversationId: string, limit = 20): Promise<ConversationMessage[]> {
    const { data, error } = await supabaseAdmin
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) throw error;
    return (data || []) as ConversationMessage[];
}

/**
 * Save a message to conversation
 */
export async function saveMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    tokensUsed = 0
): Promise<void> {
    const { error } = await supabaseAdmin
        .from('chat_messages')
        .insert({
            conversation_id: conversationId,
            role,
            content,
            tokens_used: tokensUsed
        });

    if (error) throw error;
}

/**
 * Main chat function - generates AI response
 */
export async function generateChatResponse(
    userId: string,
    agentId: string,
    userMessage: string,
    languageId?: string
): Promise<ChatResponse> {
    // Get agent
    const agent = await getAgent(agentId);
    if (!agent) {
        throw new Error('Chatbot agent not found or inactive');
    }

    // Get or create conversation
    const conversationId = await getOrCreateConversation(userId, agentId, languageId);

    // Save user message
    await saveMessage(conversationId, 'user', userMessage);

    // Get language info
    let languageName = 'English';
    if (languageId) {
        const { data: lang } = await supabaseAdmin
            .from('languages')
            .select('name')
            .eq('id', languageId)
            .single();
        if (lang) languageName = lang.name;
    }

    // Get policies and knowledge
    const policies = await getAgentPolicies(agent, languageId);
    const knowledgeDocs = await getAgentKnowledgeDocs(agentId);

    // Build system prompt
    const systemPrompt = buildSystemPrompt(agent, policies, knowledgeDocs, languageName);

    // Get conversation history
    const history = await getConversationHistory(conversationId);

    // Build messages for OpenAI
    const messages: OpenAIMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content }))
    ];

    // Call OpenAI
    const { content, tokensUsed } = await callOpenAI(messages);

    // Save assistant response
    await saveMessage(conversationId, 'assistant', content, tokensUsed);

    return {
        message: content,
        conversationId,
        tokensUsed
    };
}

/**
 * Escalate conversation to human support
 */
export async function escalateToHuman(
    conversationId: string,
    userId: string
): Promise<{ ticketId: string; ticketNumber: string }> {
    // Get conversation and messages for context
    const { data: conversation } = await supabaseAdmin
        .from('chat_conversations')
        .select(`
            id,
            agent:chatbot_agents(name)
        `)
        .eq('id', conversationId)
        .single();

    const { data: messages } = await supabaseAdmin
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

    // Format chat history for ticket
    const chatHistory = (messages || [])
        .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join('\n\n');

    const agentName = (conversation?.agent as any)?.name || 'AI Assistant';

    // Generate ticket number
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { count } = await supabaseAdmin
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().slice(0, 10));

    const counter = (count || 0) + 1;
    const ticketNumber = `TKT-${today}-${counter.toString().padStart(4, '0')}`;

    // Create support ticket
    const { data: ticket, error } = await supabaseAdmin
        .from('support_tickets')
        .insert({
            user_id: userId,
            ticket_number: ticketNumber,
            issue_type: 'Chat Escalation',
            subject: `Escalation from ${agentName}`,
            description: `User requested to speak with a human support agent.\n\n--- Chat History ---\n\n${chatHistory}`,
            status: 'open',
            priority: 'high'
        })
        .select('id, ticket_number')
        .single();

    if (error) throw error;

    // Update conversation status
    await supabaseAdmin
        .from('chat_conversations')
        .update({
            status: 'escalated',
            escalated_ticket_id: ticket.id,
            ended_at: new Date().toISOString()
        })
        .eq('id', conversationId);

    return { ticketId: ticket.id, ticketNumber: ticket.ticket_number };
}

/**
 * Close a conversation
 */
export async function closeConversation(conversationId: string): Promise<void> {
    await supabaseAdmin
        .from('chat_conversations')
        .update({
            status: 'closed',
            ended_at: new Date().toISOString()
        })
        .eq('id', conversationId);
}

/**
 * Handle guest inquiry (non-logged-in users)
 */
export async function createGuestInquiry(
    name: string,
    email: string,
    query: string,
    phone?: string
): Promise<{ id: string; message: string }> {
    const { data, error } = await supabaseAdmin
        .from('guest_inquiries')
        .insert({
            name,
            email,
            phone,
            query,
            status: 'pending'
        })
        .select('id')
        .single();

    if (error) throw error;

    return {
        id: data.id,
        message: `Thank you, ${name}! We've received your inquiry and our team will get back to you at ${email} within 24 hours.`
    };
}

/**
 * Get all conversations for admin
 */
export async function getConversationsForAdmin(params: {
    status?: string;
    agentId?: string;
    page?: number;
    limit?: number;
}): Promise<{ conversations: any[]; total: number }> {
    const { status, agentId, page = 1, limit = 20 } = params;

    let query = supabaseAdmin
        .from('chat_conversations')
        .select(`
            *,
            user:users(id, full_name, email, avatar_url),
            agent:chatbot_agents(id, name, avatar_url)
        `, { count: 'exact' })
        .order('last_message_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (agentId) query = query.eq('agent_id', agentId);

    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
        conversations: data || [],
        total: count || 0
    };
}

/**
 * Test chatbot with a sample query
 */
export async function testChatbot(
    agentId: string,
    testMessage: string,
    languageId?: string
): Promise<{ response: string; tokensUsed: number }> {
    const agent = await getAgent(agentId);
    if (!agent) {
        throw new Error('Chatbot agent not found');
    }

    let languageName = 'English';
    if (languageId) {
        const { data: lang } = await supabaseAdmin
            .from('languages')
            .select('name')
            .eq('id', languageId)
            .single();
        if (lang) languageName = lang.name;
    }

    const policies = await getAgentPolicies(agent, languageId);
    const knowledgeDocs = await getAgentKnowledgeDocs(agentId);
    const systemPrompt = buildSystemPrompt(agent, policies, knowledgeDocs, languageName);

    const messages: OpenAIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: testMessage }
    ];

    const { content, tokensUsed } = await callOpenAI(messages);

    return { response: content, tokensUsed };
}
