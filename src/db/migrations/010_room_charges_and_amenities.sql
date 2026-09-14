-- Migration 010: Add electricity_charge, maintenance_charge and amenities to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS electricity_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS maintenance_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS amenities JSONB DEFAULT '[]'::jsonb;
