-- Migration: Waitlist System
-- Description: Add waitlist and waitlist_config tables for early access control
-- Date: 2026-03-13

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_waitlist_status ON waitlist (status, created_at);
CREATE INDEX idx_waitlist_email ON waitlist (email);

CREATE TABLE IF NOT EXISTS waitlist_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_approve_enabled BOOLEAN DEFAULT FALSE,
  auto_approve_per_day INTEGER DEFAULT 10,
  auto_approved_today INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO waitlist_config (id) VALUES (1) ON CONFLICT DO NOTHING;
