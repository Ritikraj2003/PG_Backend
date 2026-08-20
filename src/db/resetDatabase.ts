import fs from 'fs';
import path from 'path';
import pool from './database';
import { hashPassword } from '../utils/password';

async function resetDatabase() {
  console.log('💥 Starting Complete Database Reset (Drop & Re-create)...');
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

    // 3. Seed initial data
    console.log('🌱 Seeding initial application data...');
    await client.query('BEGIN');

    // Insert Roles
    const roles = ['SUPER_ADMIN', 'OWNER', 'STAFF', 'TENANT'];
    for (const r of roles) {
      await client.query(
        `INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
        [r, `${r} role permissions`]
      );
    }

    const superAdminRole = (await client.query("SELECT id FROM roles WHERE name = 'SUPER_ADMIN'")).rows[0].id;
    const ownerRole = (await client.query("SELECT id FROM roles WHERE name = 'OWNER'")).rows[0].id;
    const tenantRole = (await client.query("SELECT id FROM roles WHERE name = 'TENANT'")).rows[0].id;

    // Direct plain passwords (no hashing)
    const adminPassHash = await hashPassword('admin123');
    const ownerPassHash = await hashPassword('owner123');
    const tenantPassHash = await hashPassword('tenant123');

    // Super Admin User
    const adminRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active, is_email_verified)
       VALUES ('Super Admin', 'admin@pgmanagement.com', '9999999999', $1, TRUE, TRUE)
       RETURNING id`,
      [adminPassHash]
    );
    const adminId = adminRes.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [adminId, superAdminRole]
    );

    // Property Owner User
    const ownerUserRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active, is_email_verified)
       VALUES ('Rajesh Sharma', 'owner@comfortstays.com', '9876543210', $1, TRUE, TRUE)
       RETURNING id`,
      [ownerPassHash]
    );
    const ownerUserId = ownerUserRes.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [ownerUserId, ownerRole]
    );

    // Property Owner Profile
    const poRes = await client.query(
      `INSERT INTO property_owners (user_id, owner_code, business_name, contact_number, email, address, city, state)
       VALUES ($1, 'OWN-001', 'Comfort Stays Hospitality', '9876543210', 'owner@comfortstays.com', '123 Tech Park Road', 'Bengaluru', 'Karnataka')
       RETURNING id`,
      [ownerUserId]
    );
    const ownerId = poRes.rows[0].id;

    // Single Property for Owner
    const propRes = await client.query(
      `INSERT INTO properties (owner_id, property_name, property_type, description, address, city, state)
       VALUES ($1, 'Comfort Stays Luxury PG & Living', 'PG', 'Premium tech-enabled co-living space with high-speed WiFi, food, housekeeping.', '45 Koramangala 4th Block', 'Bengaluru', 'Karnataka')
       RETURNING id`,
      [ownerId]
    );
    const propertyId = propRes.rows[0].id;

    // Branches
    const branch1Res = await client.query(
      `INSERT INTO branches (property_id, branch_code, branch_name, address, landmark, city, state, pincode, contact_number, email)
       VALUES ($1, 'BR-KOR-01', 'Comfort Stays - Koramangala Branch', '45 Koramangala 4th Block', 'Near Sony Signal', 'Bengaluru', 'Karnataka', '560034', '9876543210', 'koramangala@comfortstays.com')
       RETURNING id`,
      [propertyId]
    );
    const branch1Id = branch1Res.rows[0].id;

    const branch2Res = await client.query(
      `INSERT INTO branches (property_id, branch_code, branch_name, address, landmark, city, state, pincode, contact_number, email)
       VALUES ($1, 'BR-HSR-02', 'Comfort Stays - HSR Layout Branch', '78 Sector 1, HSR Layout', 'Near BDA Complex', 'Bengaluru', 'Karnataka', '560102', '9876543211', 'hsr@comfortstays.com')
       RETURNING id`,
      [propertyId]
    );

    // Floors
    const floor1Res = await client.query(
      `INSERT INTO floors (branch_id, floor_number, floor_name) VALUES ($1, 1, 'First Floor') RETURNING id`,
      [branch1Id]
    );
    const floor1Id = floor1Res.rows[0].id;

    // Room Types
    const singleType = await client.query(
      `INSERT INTO room_types (name, capacity, description) VALUES ('Single Private Room', 1, 'Private room with attached bathroom') RETURNING id`
    );
    const doubleType = await client.query(
      `INSERT INTO room_types (name, capacity, description) VALUES ('Double Sharing Room', 2, 'Two bed room with individual wardrobe') RETURNING id`
    );

    // Rooms & Beds
    const room101 = await client.query(
      `INSERT INTO rooms (branch_id, floor_id, room_type_id, room_number, room_name, monthly_rent, security_deposit, status)
       VALUES ($1, $2, $3, '101', 'Deluxe Single 101', 14000.00, 20000.00, 'AVAILABLE')
       RETURNING id`,
      [branch1Id, floor1Id, singleType.rows[0].id]
    );

    const room102 = await client.query(
      `INSERT INTO rooms (branch_id, floor_id, room_type_id, room_number, room_name, monthly_rent, security_deposit, status)
       VALUES ($1, $2, $3, '102', 'Sharing 102', 8500.00, 12000.00, 'PARTIALLY_OCCUPIED')
       RETURNING id`,
      [branch1Id, floor1Id, doubleType.rows[0].id]
    );

    if (room102.rows.length > 0) {
      const roomId102 = room102.rows[0].id;
      await client.query(
        `INSERT INTO beds (branch_id, room_id, bed_number, bed_name, monthly_rent, security_deposit, status)
         VALUES ($1, $2, '102-A', 'Bed A', 8500.00, 12000.00, 'OCCUPIED')`,
        [branch1Id, roomId102]
      );
      await client.query(
        `INSERT INTO beds (branch_id, room_id, bed_number, bed_name, monthly_rent, security_deposit, status)
         VALUES ($1, $2, '102-B', 'Bed B', 8500.00, 12000.00, 'AVAILABLE')`,
        [branch1Id, roomId102]
      );
    }

    // Tenant User
    const tenantUserRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active, is_email_verified)
       VALUES ('Aarav Patel', 'tenant@gmail.com', '9123456789', $1, TRUE, TRUE)
       RETURNING id`,
      [tenantPassHash]
    );
    const tenantUserId = tenantUserRes.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [tenantUserId, tenantRole]
    );

    await client.query(
      `INSERT INTO tenants (user_id, branch_id, tenant_code, full_name, mobile_number, email, occupation, company_name, city, status)
       VALUES ($1, $2, 'TNT-1001', 'Aarav Patel', '9123456789', 'tenant@gmail.com', 'Software Engineer', 'Tech Corp', 'Bengaluru', 'ACTIVE')`,
      [tenantUserId, branch1Id]
    );

    // Amenities
    const amenities = [
      { name: 'High-Speed WiFi', icon: 'wifi' },
      { name: '3 Times Food / Meals', icon: 'utensils' },
      { name: 'Daily Housekeeping', icon: 'broom' },
      { name: 'Air Conditioning', icon: 'snowflake' },
      { name: '24/7 Power Backup', icon: 'bolt' },
      { name: 'Washing Machine / Laundry', icon: 'shirt' },
    ];
    for (const a of amenities) {
      const aRes = await client.query(
        `INSERT INTO amenities (name, icon) VALUES ($1, $2) RETURNING id`,
        [a.name, a.icon]
      );
      await client.query(
        `INSERT INTO branch_amenities (branch_id, amenity_id) VALUES ($1, $2)`,
        [branch1Id, aRes.rows[0].id]
      );
    }

    await client.query('COMMIT');
    console.log('🎉 Database reset & re-creation completed successfully!');
    console.log('\n--- FRESH DEMO ACCOUNTS ---');
    console.log('Super Admin:    admin@pgmanagement.com / admin123');
    console.log('Property Owner: owner@comfortstays.com / owner123');
    console.log('Tenant:         tenant@gmail.com / tenant123');
    console.log('-----------------------------\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database reset failed:', err);
  } finally {
    client.release();
    await pool.pool.end();
  }
}

resetDatabase();
