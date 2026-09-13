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

    // 2. Run all schema migrations in order
    console.log('📜 Executing all database migrations...');
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      console.log(`Executing migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`  ✓ ${file} executed successfully`);
    }
    console.log('✅ All migrations executed successfully.');

    // 3. Seed ONLY Super Admin, system roles, and permissions
    console.log('🌱 Seeding Super Admin, roles, and permissions...');
    await client.query('BEGIN');

    // Insert Default System Roles
    const roles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'STAFF', 'USER'];
    for (const r of roles) {
      const existing = await client.query("SELECT id FROM roles WHERE name = $1 AND owner_id IS NULL", [r]);
      if (existing.rows.length === 0) {
        await client.query("INSERT INTO roles (name, description) VALUES ($1, $2)", [r, `${r} role permissions`]);
      }
    }

    const superAdminRoleRes = await client.query("SELECT id FROM roles WHERE name = 'SUPER_ADMIN' AND owner_id IS NULL");
    const superAdminRole = superAdminRoleRes.rows[0].id;

    // Super Admin Password
    const adminPassHash = await hashPassword('admin123');

    // Super Admin User
    const adminRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active)
       VALUES ('Super Admin', 'admin@pgmanagement.com', '9999999999', $1, TRUE)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = TRUE
       RETURNING id`,
      [adminPassHash]
    );
    const adminId = adminRes.rows[0].id;

    // Assign SUPER_ADMIN role
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [adminId, superAdminRole]
    );

    // Map ALL system permissions to SUPER_ADMIN role
    await client.query(`
      INSERT INTO role_permission_mapping (role_id, permission_id)
      SELECT $1, id FROM permissions
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `, [superAdminRole]);
    console.log(`✅ Granted all system permissions to SUPER_ADMIN role.`);

    await client.query('COMMIT');
    console.log('🎉 Database wipe & Super Admin seeding completed successfully!');
    console.log('\n=============================================');
    console.log('🔑 SUPER ADMIN LOGIN CREDENTIALS');
    console.log('Email:       admin@pgmanagement.com');
    console.log('Password:    admin123');
    console.log('Mobile:      9999999999');
    console.log('Role:        SUPER_ADMIN');
    console.log('Permissions: All System Permissions Assigned');
    console.log('=============================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database reset failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.pool.end();
  }
}

resetDatabase().catch(() => process.exit(1));
