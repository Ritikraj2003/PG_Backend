-- Migration: 002_subscription_plans.sql
-- Subscriptions table to manage Owner/Property SaaS plans (2, 3, 6, 12 months)

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    plan_name VARCHAR(100) NOT NULL,
    duration_months INT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    price NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date);
