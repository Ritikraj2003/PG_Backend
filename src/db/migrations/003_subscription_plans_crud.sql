-- Migration: 003_subscription_plans_crud.sql
-- 1. Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    duration_months INT NOT NULL DEFAULT 1,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_branches INT NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Alter subscriptions table to link branch_id and plan_id
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS max_branches INT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_subscriptions_branch ON subscriptions(branch_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan_id);

-- 3. Seed initial default plans if empty
INSERT INTO subscription_plans (name, description, duration_months, price, max_branches, is_active)
SELECT 'Starter Plan (2 Months)', 'Standard plan for single branch operations with full inventory & tenant management', 2, 1999.00, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE duration_months = 2);

INSERT INTO subscription_plans (name, description, duration_months, price, max_branches, is_active)
SELECT 'Quarterly Plan (3 Months)', 'Multi-branch operations with automated invoicing and priority support', 3, 2999.00, 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE duration_months = 3);

INSERT INTO subscription_plans (name, description, duration_months, price, max_branches, is_active)
SELECT 'Half-Yearly Plan (6 Months)', 'Growing PG business package with comprehensive analytics & staff delegation', 6, 5499.00, 3, TRUE
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE duration_months = 6);

INSERT INTO subscription_plans (name, description, duration_months, price, max_branches, is_active)
SELECT 'Annual Plan (12 Months)', 'Enterprise unlimited package with all features and automated yearly renewals', 12, 9999.00, 10, TRUE
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE duration_months = 12);

-- 4. Map existing subscriptions to branches if branch_id is NULL
UPDATE subscriptions s
SET branch_id = (
    SELECT b.id FROM branches b 
    WHERE b.property_id = s.property_id 
    ORDER BY b.created_at ASC 
    LIMIT 1
)
WHERE s.branch_id IS NULL AND s.property_id IS NOT NULL;
