-- Migration: 012_expense_enhancements.sql
-- Add title, paid_to, payment_method to expenses table

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS title VARCHAR(200);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_to VARCHAR(150);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'UPI';

-- Update existing expenses to have a title if null
UPDATE expenses SET title = category WHERE title IS NULL;

-- Create index on branch_id and expense_date
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
