-- Migration: 004_roles_and_permissions.sql
-- Exact table structure for permissions and role_permission_mapping

CREATE TABLE IF NOT EXISTS public.permissions (
  id BIGSERIAL PRIMARY KEY,
  permission_name VARCHAR(100) NOT NULL,
  permission_code VARCHAR(20) NOT NULL UNIQUE,
  created_by VARCHAR(100),
  created_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_modified_by VARCHAR(100),
  last_modified_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.role_permission_mapping (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  created_by VARCHAR(100),
  created_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_modified_by VARCHAR(100),
  last_modified_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE public.role_permission_mapping ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;

-- Update roles table to allow company owners to define custom roles
ALTER TABLE roles ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS last_modified_by VARCHAR(100);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS last_modified_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'roles_name_key'
  ) THEN
    ALTER TABLE roles DROP CONSTRAINT roles_name_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS roles_system_name_idx ON roles(name) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS roles_owner_name_idx ON roles(owner_id, name) WHERE owner_id IS NOT NULL;

-- Update users table to link staff accounts to their Company Owner
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Seed default application permissions
INSERT INTO public.permissions (permission_name, permission_code) VALUES
  ('DASHBOARD', 'DASH'),
  ('Rooms View', 'RMS_VIEW'),
  ('Rooms Add', 'RMS_ADD'),
  ('Rooms Edit', 'RMS_EDIT'),
  ('Rooms Delete', 'RMS_DEL'),
  ('Bookings View', 'BKG_VIEW'),
  ('Bookings Add', 'BKG_ADD'),
  ('Bookings Edit', 'BKG_EDIT'),
  ('Bookings Delete', 'BKG_DEL'),
  ('Invoices View', 'INV_VIEW'),
  ('Invoices Create', 'INV_ADD'),
  ('Invoices Edit', 'INV_EDIT'),
  ('Invoices Delete', 'INV_DEL'),
  ('Payments View', 'PYT_VIEW'),
  ('Payments Record', 'PYT_ADD'),
  ('Payments Edit', 'PYT_EDIT'),
  ('Payments Delete', 'PYT_DEL'),
  ('Expenses View', 'EXP_VIEW'),
  ('Expenses Add', 'EXP_ADD'),
  ('Expenses Edit', 'EXP_EDIT'),
  ('Expenses Delete', 'EXP_DEL'),
  ('Tenants View', 'TNT_VIEW'),
  ('Tenants Add', 'TNT_ADD'),
  ('Tenants Edit', 'TNT_EDIT'),
  ('Tenants Delete', 'TNT_DEL'),
  ('Branch Settings View', 'SET_VIEW'),
  ('Branch Settings Edit', 'SET_EDIT'),
  ('Roles View', 'ROL_VIEW'),
  ('Roles Manage', 'ROL_MANAGE')
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name;
