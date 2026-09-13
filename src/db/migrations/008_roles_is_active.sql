-- Migration: 008_roles_is_active.sql
-- Add is_active column to roles table

ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
UPDATE roles SET is_active = TRUE WHERE is_active IS NULL;
