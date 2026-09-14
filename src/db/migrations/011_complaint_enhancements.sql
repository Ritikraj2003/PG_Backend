-- Migration: 011_complaint_enhancements.sql
-- Add category, priority, complaint_number, resolved_at, resolution_notes to complaints table

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS complaint_number VARCHAR(50);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'MAINTENANCE';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'MEDIUM';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- Create index on complaint_number and branch_id
CREATE INDEX IF NOT EXISTS idx_complaints_branch_id ON complaints(branch_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);

-- Seed Complaints permissions if permissions table exists
INSERT INTO public.permissions (permission_name, permission_code) 
VALUES
  ('Complaints View', 'CMP_VIEW'),
  ('Complaints Manage', 'CMP_MANAGE')
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name;
