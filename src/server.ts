import fs from 'fs';
import path from 'path';
import app from './app';
import { config } from './config/env';
import pool from './db/database';

const PORT = config.port;

const server = app.listen(PORT, async () => {
  console.log(`
  🚀 PG & Rental House Management SaaS Backend Server Started!
  -------------------------------------------------------------
  Environment: ${config.nodeEnv}
  Port:        ${PORT}
  API Endpoint: http://localhost:${PORT}/api
  HealthCheck: http://localhost:${PORT}/health
  -------------------------------------------------------------
  `);

  try {
    const dbTest = await pool.query('SELECT NOW()');
    console.log(`✅ Database Connected Successfully at ${dbTest.rows[0].now}`);
    await pool.query('ALTER TABLE beds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;');
    await pool.query('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;');
    await pool.query(`
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
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
        branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
        plan_name VARCHAR(100) NOT NULL,
        duration_months INT NOT NULL,
        max_branches INT DEFAULT 1,
        start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        end_date TIMESTAMP WITH TIME ZONE NOT NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        price NUMERIC(10, 2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL;
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS max_branches INT DEFAULT 1;
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'CASH';
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(150);
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'PAID';
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
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS photo_url TEXT;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS permanent_address TEXT;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city VARCHAR(100);
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS state VARCHAR(100);
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(50);
      ALTER TABLE complaints ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE complaints ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;
    `);

    const migrationPaths = [
      path.join(__dirname, 'db', 'migrations', '004_roles_and_permissions.sql'),
      path.join(process.cwd(), 'src', 'db', 'migrations', '004_roles_and_permissions.sql'),
      path.join(process.cwd(), 'backend', 'src', 'db', 'migrations', '004_roles_and_permissions.sql'),
      path.join(__dirname, '..', 'src', 'db', 'migrations', '004_roles_and_permissions.sql'),
    ];
    for (const mPath of migrationPaths) {
      if (fs.existsSync(mPath)) {
        const sql004 = fs.readFileSync(mPath, 'utf8');
        await pool.query(sql004);
        break;
      }
    }

    // Ensure branch_id is present in role_permission_mapping and roles tables
    await pool.query(`
      ALTER TABLE public.role_permission_mapping ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
      ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE;
    `);
  } catch (err) {
    console.warn(`⚠️ Warning: Database connection failed. Please verify DATABASE_URL in .env:`, err);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:', error);
});

export default server;
