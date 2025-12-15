-- Support System Tables Migration
-- Run this SQL in Supabase SQL Editor to add support ticket system

-- =====================================================
-- SUPPORT TICKETS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ticket_number VARCHAR(20) UNIQUE NOT NULL,
  issue_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- =====================================================
-- SUPPORT MESSAGES TABLE (Chat-like interaction)
-- =====================================================

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_from_admin BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_number ON support_tickets(ticket_number);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created ON support_messages(ticket_id, created_at);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Users can view and create their own tickets
CREATE POLICY support_tickets_user_policy ON support_tickets 
  FOR ALL USING (auth.uid() = user_id);

-- Users can view and create messages on their own tickets
CREATE POLICY support_messages_user_policy ON support_messages 
  FOR ALL USING (
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
  );

-- Admins can access all tickets
CREATE POLICY support_tickets_admin_policy ON support_tickets 
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- Admins can access all messages
CREATE POLICY support_messages_admin_policy ON support_messages 
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'content_manager')
  );

-- =====================================================
-- HELPER FUNCTION: Generate Ticket Number
-- =====================================================

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
DECLARE
  ticket_num TEXT;
  counter INT;
BEGIN
  -- Get count of tickets today
  SELECT COUNT(*) + 1 INTO counter 
  FROM support_tickets 
  WHERE DATE(created_at) = CURRENT_DATE;
  
  -- Format: TKT-YYYYMMDD-XXXX
  ticket_num := 'TKT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
  
  RETURN ticket_num;
END;
$$ LANGUAGE plpgsql;
