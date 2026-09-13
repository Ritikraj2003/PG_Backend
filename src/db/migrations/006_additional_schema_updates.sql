-- Migration: 006_additional_schema_updates.sql
-- Missing subscription payment columns and booking/tenant/complaint fields

-- Subscriptions Payment & Transaction fields
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'CASH';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(150);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'PAID';

-- Bookings additional fields
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_number VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_status VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS document_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS document_type VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS document_number VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS company_name VARCHAR(150);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS permanent_address TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS emergency_name VARCHAR(150);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS emergency_relation VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS expected_check_in_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_payment_amount NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Tenants additional fields
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS permanent_address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(50);

-- Complaints additional fields
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

-- Role permissions branch linkage
ALTER TABLE public.role_permission_mapping ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
