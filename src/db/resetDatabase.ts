import fs from 'fs';
import path from 'path';
import pool from './database';
import { hashPassword } from '../utils/password';

async function resetDatabase() {
  console.log('💥 Starting Complete Database Reset (Clean Slate)...');
  const client = await pool.getClient();

  try {
    // 1. Drop existing public schema and re-create it
    console.log('🗑️ Dropping existing tables and schema...');
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('✅ Schema reset complete.');

    // 2. Run initial schema migrations
    console.log('📜 Re-creating database tables from schema...');
    const migrationFile = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    const migrationSql = fs.readFileSync(migrationFile, 'utf8');
    await client.query(migrationSql);
    console.log('✅ All tables re-created successfully.');

    // 3. Seed ONLY Super Admin and system roles
    console.log('🌱 Seeding Super Admin and default system roles...');
    await client.query('BEGIN');

    // Insert Roles
    const roles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'STAFF', 'USER'];
    for (const r of roles) {
      await client.query(
        `INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
        [r, `${r} role permissions`]
      );
    }

    const superAdminRole = (await client.query("SELECT id FROM roles WHERE name = 'SUPER_ADMIN'")).rows[0].id;

    // Super Admin Password
    const adminPassHash = await hashPassword('admin123');

    // Super Admin User
    const adminRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active)
       VALUES ('Super Admin', 'admin@pgmanagement.com', '9999999999', $1, TRUE)
       RETURNING id`,
      [adminPassHash]
    );
    const adminId = adminRes.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [adminId, superAdminRole]
    );

    await client.query('COMMIT');
    console.log('🎉 Database wipe & Super Admin seeding completed successfully!');
    console.log('\n=============================================');
    console.log('🔑 SUPER ADMIN LOGIN CREDENTIALS');
    console.log('Email:    admin@pgmanagement.com');
    console.log('Password: admin123');
    console.log('Mobile:   9999999999');
    console.log('=============================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database reset failed:', err);
  } finally {
    client.release();
    await pool.pool.end();
  }
}

resetDatabase();
