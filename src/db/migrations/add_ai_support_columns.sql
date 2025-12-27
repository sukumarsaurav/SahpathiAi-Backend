-- Migration: Add AI Support Agent columns for support_tickets and support_messages
-- Run this migration to enable AI-first support with human handoff

-- Add AI handling columns to support_tickets
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS handler_mode VARCHAR(20) DEFAULT 'ai' CHECK (handler_mode IN ('ai', 'human', 'hybrid')),
ADD COLUMN IF NOT EXISTS ai_conversation_id UUID,
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assigned_human_id UUID REFERENCES users(id);

-- Add message type to support_messages for distinguishing AI vs human responses
ALTER TABLE support_messages 
ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'user' CHECK (message_type IN ('user', 'ai', 'human', 'system')),
ADD COLUMN IF NOT EXISTS ai_tokens_used INTEGER DEFAULT 0;

-- Add index for faster queries on handler mode (for admin escalation queue)
CREATE INDEX IF NOT EXISTS idx_support_tickets_handler_mode ON support_tickets(handler_mode);
CREATE INDEX IF NOT EXISTS idx_support_tickets_escalated ON support_tickets(escalated_at DESC) WHERE escalated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_human ON support_tickets(assigned_human_id) WHERE assigned_human_id IS NOT NULL;

-- Add index for message types
CREATE INDEX IF NOT EXISTS idx_support_messages_type ON support_messages(message_type);

COMMENT ON COLUMN support_tickets.handler_mode IS 'ai = AI only, human = Human only, hybrid = AI started then escalated to human';
COMMENT ON COLUMN support_tickets.escalated_at IS 'When the ticket was escalated from AI to human';
COMMENT ON COLUMN support_tickets.assigned_human_id IS 'The human support agent assigned after escalation';
COMMENT ON COLUMN support_messages.message_type IS 'user = from user, ai = AI agent response, human = human agent response, system = system notification';
COMMENT ON COLUMN support_messages.ai_tokens_used IS 'OpenAI tokens consumed for this AI response';
