import pool from './database';
import { hashPassword } from '../utils/password';

async function seed() {
  console.log('🌱 Starting Database Seeding...');
  const client = await pool.getClient();

  try {
    await client.query('BEGIN');

    // 1. Insert Roles
    console.log('Inserting roles...');
    const roles = ['SUPER_ADMIN', 'OWNER', 'STAFF', 'TENANT'];
    for (const r of roles) {
      await client.query(
        `INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
        [r, `${r} role permissions`]
      );
    }

    // Get Role IDs
    const superAdminRole = (await client.query("SELECT id FROM roles WHERE name = 'SUPER_ADMIN'")).rows[0].id;
    const ownerRole = (await client.query("SELECT id FROM roles WHERE name = 'OWNER'")).rows[0].id;
    const tenantRole = (await client.query("SELECT id FROM roles WHERE name = 'TENANT'")).rows[0].id;

    // Normal Passwords
    const adminPassHash = await hashPassword('admin123');
    const ownerPassHash = await hashPassword('owner123');
    const tenantPassHash = await hashPassword('tenant123');

    // 2. Create Super Admin User
    console.log('Creating Super Admin...');
    const adminRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active, is_email_verified)
       VALUES ('Super Admin', 'admin@pgmanagement.com', '9999999999', $1, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [adminPassHash]
    );
    const adminId = adminRes.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [adminId, superAdminRole]
    );

    // 3. Create Property Owner User
    console.log('Creating Property Owner...');
    const ownerUserRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active, is_email_verified)
       VALUES ('Rajesh Sharma', 'owner@comfortstays.com', '9876543210', $1, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [ownerPassHash]
    );
    const ownerUserId = ownerUserRes.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [ownerUserId, ownerRole]
    );

    // Property Owner Profile
    const poRes = await client.query(
      `INSERT INTO property_owners (user_id, owner_code, business_name, contact_number, email, address, city, state)
       VALUES ($1, 'OWN-001', 'Comfort Stays Hospitality', '9876543210', 'owner@comfortstays.com', '123 Tech Park Road', 'Bengaluru', 'Karnataka')
       ON CONFLICT (user_id) DO UPDATE SET business_name = EXCLUDED.business_name
       RETURNING id`,
      [ownerUserId]
    );
    const ownerId = poRes.rows[0].id;

    // 4. Create Single Property for Owner (Rule: 1 Owner = 1 Property)
    console.log('Creating Property...');
    const propRes = await client.query(
      `INSERT INTO properties (owner_id, property_name, property_type, description, address, city, state)
       VALUES ($1, 'Comfort Stays Luxury PG & Living', 'PG', 'Premium tech-enabled co-living space with high-speed WiFi, food, housekeeping.', '45 Koramangala 4th Block', 'Bengaluru', 'Karnataka')
       ON CONFLICT (owner_id) DO UPDATE SET property_name = EXCLUDED.property_name
       RETURNING id`,
      [ownerId]
    );
    const propertyId = propRes.rows[0].id;

    // 5. Create Multiple Branches for Property
    console.log('Creating Branches...');
    const branch1Res = await client.query(
      `INSERT INTO branches (property_id, branch_code, branch_name, address, landmark, city, state, pincode, contact_number, email)
       VALUES ($1, 'BR-KOR-01', 'Comfort Stays - Koramangala Branch', '45 Koramangala 4th Block', 'Near Sony Signal', 'Bengaluru', 'Karnataka', '560034', '9876543210', 'koramangala@comfortstays.com')
       ON CONFLICT (branch_code) DO UPDATE SET branch_name = EXCLUDED.branch_name
       RETURNING id`,
      [propertyId]
    );
    const branch1Id = branch1Res.rows[0].id;

    const branch2Res = await client.query(
      `INSERT INTO branches (property_id, branch_code, branch_name, address, landmark, city, state, pincode, contact_number, email)
       VALUES ($1, 'BR-HSR-02', 'Comfort Stays - HSR Layout Branch', '78 Sector 1, HSR Layout', 'Near BDA Complex', 'Bengaluru', 'Karnataka', '560102', '9876543211', 'hsr@comfortstays.com')
       ON CONFLICT (branch_code) DO UPDATE SET branch_name = EXCLUDED.branch_name
       RETURNING id`,
      [propertyId]
    );
    const branch2Id = branch2Res.rows[0].id;

    // 6. Create Floors
    console.log('Creating Floors...');
    const floor1Res = await client.query(
      `INSERT INTO floors (branch_id, floor_number, floor_name) VALUES ($1, 1, 'First Floor') RETURNING id`,
      [branch1Id]
    );
    const floor1Id = floor1Res.rows[0].id;

    const floor2Res = await client.query(
      `INSERT INTO floors (branch_id, floor_number, floor_name) VALUES ($1, 2, 'Second Floor') RETURNING id`,
      [branch1Id]
    );
    const floor2Id = floor2Res.rows[0].id;

    // 7. Create Room Types
    console.log('Creating Room Types...');
    const singleType = await client.query(
      `INSERT INTO room_types (name, capacity, description) VALUES ('Single Private Room', 1, 'Private room with attached bathroom') RETURNING id`
    );
    const doubleType = await client.query(
      `INSERT INTO room_types (name, capacity, description) VALUES ('Double Sharing Room', 2, 'Two bed room with individual wardrobe') RETURNING id`
    );
    const tripleType = await client.query(
      `INSERT INTO room_types (name, capacity, description) VALUES ('Triple Sharing Room', 3, 'Three bed spacious ventilated room') RETURNING id`
    );

    // 8. Create Rooms
    console.log('Creating Rooms...');
    const room101 = await client.query(
      `INSERT INTO rooms (branch_id, floor_id, room_type_id, room_number, room_name, monthly_rent, security_deposit, status)
       VALUES ($1, $2, $3, '101', 'Deluxe Single 101', 14000.00, 20000.00, 'AVAILABLE')
       ON CONFLICT (branch_id, room_number) DO NOTHING RETURNING id`,
      [branch1Id, floor1Id, singleType.rows[0].id]
    );

    const room102 = await client.query(
      `INSERT INTO rooms (branch_id, floor_id, room_type_id, room_number, room_name, monthly_rent, security_deposit, status)
       VALUES ($1, $2, $3, '102', 'Sharing 102', 8500.00, 12000.00, 'PARTIALLY_OCCUPIED')
       ON CONFLICT (branch_id, room_number) DO NOTHING RETURNING id`,
      [branch1Id, floor1Id, doubleType.rows[0].id]
    );

    // 9. Create Beds for Room 102
    if (room102.rows.length > 0) {
      const roomId102 = room102.rows[0].id;
      await client.query(
        `INSERT INTO beds (branch_id, room_id, bed_number, bed_name, monthly_rent, security_deposit, status)
         VALUES ($1, $2, '102-A', 'Bed A', 8500.00, 12000.00, 'OCCUPIED') ON CONFLICT DO NOTHING`,
        [branch1Id, roomId102]
      );
      await client.query(
        `INSERT INTO beds (branch_id, room_id, bed_number, bed_name, monthly_rent, security_deposit, status)
         VALUES ($1, $2, '102-B', 'Bed B', 8500.00, 12000.00, 'AVAILABLE') ON CONFLICT DO NOTHING`,
        [branch1Id, roomId102]
      );
    }

    // 10. Create Sample Tenant User
    console.log('Creating Tenant User...');
    const tenantUserRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active, is_email_verified)
       VALUES ('Aarav Patel', 'tenant@gmail.com', '9123456789', $1, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [tenantPassHash]
    );
    const tenantUserId = tenantUserRes.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [tenantUserId, tenantRole]
    );

    const seedTenantRes = await client.query(
      `INSERT INTO tenants (user_id, branch_id, tenant_code, full_name, mobile_number, email, occupation, company_name, city, status)
       VALUES ($1, $2, 'TNT-1001', 'Aarav Patel', '9123456789', 'tenant@gmail.com', 'Software Engineer', 'Tech Corp', 'Bengaluru', 'ACTIVE')
       ON CONFLICT (user_id) DO NOTHING RETURNING id`,
      [tenantUserId, branch1Id]
    );

    const seedTenantId = seedTenantRes.rows[0]?.id || (await client.query("SELECT id FROM tenants WHERE email = 'tenant@gmail.com'")).rows[0]?.id;
    if (seedTenantId) {
      await client.query(
        `INSERT INTO emergency_contacts (tenant_id, name, relation, phone)
         VALUES ($1, 'Ramesh Patel', 'Father', '9876500000') ON CONFLICT DO NOTHING`,
        [seedTenantId]
      );
      await client.query(
        `INSERT INTO tenant_documents (tenant_id, document_type, document_number, document_url)
         VALUES 
         ($1, 'AADHAAR_CARD', '5482-9012-3456', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80'),
         ($1, 'PAN_CARD', 'ABCDE1234F', 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80')
         ON CONFLICT DO NOTHING`,
        [seedTenantId]
      );
    }

    // 11. Create Amenities
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
        `INSERT INTO amenities (name, icon) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET icon = EXCLUDED.icon RETURNING id`,
        [a.name, a.icon]
      );
      await client.query(
        `INSERT INTO branch_amenities (branch_id, amenity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [branch1Id, aRes.rows[0].id]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Database Seeding Completed Successfully!');
    console.log('\n--- DEMO ACCOUNTS ---');
    console.log('Super Admin: admin@pgmanagement.com / admin123');
    console.log('Property Owner: owner@comfortstays.com / owner123');
    console.log('Tenant: tenant@gmail.com / tenant123');
    console.log('---------------------\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
  } finally {
    client.release();
    await pool.pool.end();
  }
}

seed();
