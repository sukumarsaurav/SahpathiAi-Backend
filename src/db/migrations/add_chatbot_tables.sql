-- =====================================================
-- CHATBOT AUTOMATION SYSTEM TABLES
-- Run this SQL in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- POLICY CATEGORIES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS policy_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default policy categories
INSERT INTO policy_categories (name, description, icon, display_order) VALUES
  ('Billing & Payments', 'Policies related to billing, payments, refunds, and invoices', 'CreditCard', 1),
  ('Subscriptions', 'Subscription plans, upgrades, cancellations, and renewals', 'Crown', 2),
  ('Technical Issues', 'Technical support, bugs, app issues, and troubleshooting', 'Wrench', 3),
  ('General FAQ', 'Frequently asked questions and general information', 'HelpCircle', 4),
  ('Others', 'Miscellaneous policies and information', 'MoreHorizontal', 5)
ON CONFLICT DO NOTHING;

-- =====================================================
-- CHATBOT AGENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS chatbot_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  description TEXT,
  system_prompt TEXT NOT NULL,
  welcome_message TEXT DEFAULT 'Hello! How can I help you today?',
  default_language_id UUID REFERENCES languages(id),
  supported_language_ids JSONB DEFAULT '[]'::jsonb,
  personality_traits JSONB DEFAULT '{}'::jsonb,
  -- Linked policy categories (null = all categories)
  policy_category_ids JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- =====================================================
-- COMPANY POLICIES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS company_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES policy_categories(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  language_id UUID REFERENCES languages(id),
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- =====================================================
-- KNOWLEDGE DOCUMENTS TABLE (for uploaded files)
-- =====================================================

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES chatbot_agents(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  file_url TEXT,
  file_type VARCHAR(50),
  file_size_bytes BIGINT,
  extracted_content TEXT,
  is_processed BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- =====================================================
-- CHAT CONVERSATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES chatbot_agents(id) ON DELETE SET NULL,
  language_id UUID REFERENCES languages(id),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'escalated')),
  escalated_ticket_id UUID REFERENCES support_tickets(id),
  message_count INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CHAT MESSAGES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- GUEST INQUIRIES TABLE (for non-logged-in users)
-- =====================================================

CREATE TABLE IF NOT EXISTS guest_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  query TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'resolved', 'closed')),
  admin_notes TEXT,
  responded_by UUID REFERENCES users(id),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_chatbot_agents_active ON chatbot_agents(is_active);
CREATE INDEX IF NOT EXISTS idx_company_policies_category ON company_policies(category_id);
CREATE INDEX IF NOT EXISTS idx_company_policies_active ON company_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_agent ON knowledge_documents(agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_guest_inquiries_status ON guest_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_guest_inquiries_created ON guest_inquiries(created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE policy_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_inquiries ENABLE ROW LEVEL SECURITY;

-- Public read for active agents (users need to see which agents are available)
CREATE POLICY chatbot_agents_read_policy ON chatbot_agents 
  FOR SELECT USING (is_active = true);

-- Admins can manage agents
CREATE POLICY chatbot_agents_admin_policy ON chatbot_agents 
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- Public read for policy categories
CREATE POLICY policy_categories_read_policy ON policy_categories 
  FOR SELECT USING (is_active = true);

-- Admins can manage policy categories
CREATE POLICY policy_categories_admin_policy ON policy_categories 
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- Admins can manage company policies
CREATE POLICY company_policies_admin_policy ON company_policies 
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- Admins can manage knowledge documents
CREATE POLICY knowledge_documents_admin_policy ON knowledge_documents 
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- Users can access their own conversations
CREATE POLICY chat_conversations_user_policy ON chat_conversations 
  FOR ALL USING (auth.uid() = user_id);

-- Admins can access all conversations
CREATE POLICY chat_conversations_admin_policy ON chat_conversations 
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- Users can access messages in their conversations
CREATE POLICY chat_messages_user_policy ON chat_messages 
  FOR ALL USING (
    conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = auth.uid())
  );

-- Admins can access all messages
CREATE POLICY chat_messages_admin_policy ON chat_messages 
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- Admins can manage guest inquiries
CREATE POLICY guest_inquiries_admin_policy ON guest_inquiries 
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- Allow anonymous inserts for guest inquiries
CREATE POLICY guest_inquiries_insert_policy ON guest_inquiries 
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update conversation last_message_at and message_count
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversations
  SET 
    last_message_at = NEW.created_at,
    message_count = message_count + 1
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating conversation stats
DROP TRIGGER IF EXISTS trigger_update_conversation ON chat_messages;
CREATE TRIGGER trigger_update_conversation
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_chatbot_agents_updated ON chatbot_agents;
CREATE TRIGGER trigger_chatbot_agents_updated
  BEFORE UPDATE ON chatbot_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_company_policies_updated ON company_policies;
CREATE TRIGGER trigger_company_policies_updated
  BEFORE UPDATE ON company_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
