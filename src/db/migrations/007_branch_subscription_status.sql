-- Migration: 007_branch_subscription_status.sql
-- Add subscription_status, subscription_end_date, and plan_name to branches table

ALTER TABLE branches ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'ACTIVE';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS plan_name VARCHAR(100);

-- Backfill from latest direct branch subscriptions
UPDATE branches b
SET 
  subscription_status = COALESCE(sub.status, 'ACTIVE'),
  subscription_end_date = sub.end_date,
  plan_name = sub.plan_name
FROM (
  SELECT DISTINCT ON (branch_id) branch_id, status, end_date, plan_name
  FROM subscriptions
  WHERE branch_id IS NOT NULL
  ORDER BY branch_id, created_at DESC
) sub
WHERE b.id = sub.branch_id AND b.subscription_end_date IS NULL;

-- Backfill from property-level subscriptions for branches sharing the property plan
UPDATE branches b
SET 
  subscription_status = COALESCE(sub.status, 'ACTIVE'),
  subscription_end_date = sub.end_date,
  plan_name = sub.plan_name
FROM (
  SELECT DISTINCT ON (property_id) property_id, status, end_date, plan_name
  FROM subscriptions
  WHERE property_id IS NOT NULL
  ORDER BY property_id, created_at DESC
) sub
WHERE b.property_id = sub.property_id AND b.subscription_end_date IS NULL;
