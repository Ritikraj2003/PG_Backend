import pool from './database';
import { hashPassword } from '../utils/password';

async function seed() {
  console.log('🌱 Starting Database Seeding (Super Admin Only)...');
  const client = await pool.getClient();

  try {
    await client.query('BEGIN');

    // 1. Ensure System Roles Exist
    const roles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'STAFF', 'USER'];
    for (const r of roles) {
      const existing = await client.query("SELECT id FROM roles WHERE name = $1 AND owner_id IS NULL", [r]);
      if (existing.rows.length === 0) {
        await client.query("INSERT INTO roles (name, description) VALUES ($1, $2)", [r, `${r} role permissions`]);
      }
    }

    const superAdminRoleRes = await client.query("SELECT id FROM roles WHERE name = 'SUPER_ADMIN' AND owner_id IS NULL");
    const superAdminRole = superAdminRoleRes.rows[0].id;

    // 2. Super Admin Password & User
    console.log('Creating Super Admin...');
    const adminPassHash = await hashPassword('admin123');
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

    // 3. Map all system permissions to SUPER_ADMIN role
    await client.query(`
      INSERT INTO role_permission_mapping (role_id, permission_id)
      SELECT $1, id FROM permissions
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `, [superAdminRole]);

    await client.query('COMMIT');
    console.log('✅ Super Admin seeding completed successfully!');
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
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.pool.end();
  }
}

seed().catch(() => process.exit(1));
