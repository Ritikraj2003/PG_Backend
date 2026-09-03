import pool from './database';
import { hashPassword } from '../utils/password';

async function seed() {
  console.log('🌱 Starting Database Seeding (Optimized Architecture)...');
  const client = await pool.getClient();

  try {
    await client.query('BEGIN');

    // 1. Ensure Roles Exist
    const roles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'STAFF', 'USER'];
    for (const r of roles) {
      await client.query(
        `INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
        [r, `${r} role permissions`]
      );
    }

    const companyAdminRole = (await client.query("SELECT id FROM roles WHERE name = 'COMPANY_ADMIN'")).rows[0].id;
    const userRole = (await client.query("SELECT id FROM roles WHERE name = 'USER'")).rows[0].id;

    const ownerPassHash = await hashPassword('owner123');
    const userPassHash = await hashPassword('user123');
    const adminPassHash = await hashPassword('admin123');

    // 1.5 Create Super Admin
    console.log('Creating Super Admin...');
    const superAdminRole = (await client.query("SELECT id FROM roles WHERE name = 'SUPER_ADMIN'")).rows[0].id;
    const adminRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active)
       VALUES ('System Admin', 'admin@pgmanagement.com', '9999999999', $1, TRUE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [adminPassHash]
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [adminRes.rows[0].id, superAdminRole]
    );

    // 2. Create Company Admin (Owner)
    console.log('Creating Company Admin...');
    const ownerRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active)
       VALUES ('Rajesh Sharma', 'owner@comfortstays.com', '9876543210', $1, TRUE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [ownerPassHash]
    );
    const ownerId = ownerRes.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [ownerId, companyAdminRole]
    );

    // 3. Create Property for Owner
    console.log('Creating Property & Branch...');
    const propRes = await client.query(
      `INSERT INTO properties (owner_id, name, description)
       VALUES ($1, 'Comfort Stays Luxury PG', 'Premium tech-enabled co-living space.')
       RETURNING id`,
      [ownerId]
    );
    const propertyId = propRes.rows[0].id;

    // 4. Create Branch
    const branchRes = await client.query(
      `INSERT INTO branches (property_id, name, address, city, state, contact_number, amenities)
       VALUES ($1, 'Koramangala Branch', '45 Koramangala 4th Block', 'Bengaluru', 'Karnataka', '9876543210', '["WiFi", "Food", "Laundry", "AC"]')
       RETURNING id`,
      [propertyId]
    );
    const branchId = branchRes.rows[0].id;

    // 5. Create Branch Settings (QR & Razorpay)
    await client.query(
      `INSERT INTO branch_settings (branch_id, upi_id, upi_qr_url, smtp_email)
       VALUES ($1, 'sharmapg@okicici', 'https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg', 'admin@comfortstays.com')
       ON CONFLICT DO NOTHING`,
      [branchId]
    );

    // 6. Create Rooms & Beds
    console.log('Creating Rooms and Beds...');
    const room101 = await client.query(
      `INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
       VALUES ($1, 1, '101', 'Single', 14000.00, 20000.00, 'AVAILABLE')
       RETURNING id`,
      [branchId]
    );
    await client.query(
      `INSERT INTO beds (room_id, bed_number, status) VALUES ($1, '101-A', 'AVAILABLE')`,
      [room101.rows[0].id]
    );

    const room102 = await client.query(
      `INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
       VALUES ($1, 1, '102', 'Double', 8500.00, 12000.00, 'AVAILABLE')
       RETURNING id`,
      [branchId]
    );
    await client.query(
      `INSERT INTO beds (room_id, bed_number, status) VALUES ($1, '102-A', 'AVAILABLE')`,
      [room102.rows[0].id]
    );
    const bed102B = await client.query(
      `INSERT INTO beds (room_id, bed_number, status) VALUES ($1, '102-B', 'AVAILABLE') RETURNING id`,
      [room102.rows[0].id]
    );

    // 7. Create Sample User
    console.log('Creating Normal User & Tenant...');
    const userRes = await client.query(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active)
       VALUES ('Aarav Patel', 'tenant@gmail.com', '9123456789', $1, TRUE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [userPassHash]
    );
    const userId = userRes.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, userRole]
    );

    // 8. Create a PAID Booking
    const bookingRes = await client.query(
      `INSERT INTO bookings (branch_id, user_id, room_id, bed_id, status)
       VALUES ($1, $2, $3, $4, 'PAID')
       RETURNING id`,
      [branchId, userId, room102.rows[0].id, bed102B.rows[0].id]
    );
    const bookingId = bookingRes.rows[0].id;

    // 9. Update Bed Status
    await client.query(`UPDATE beds SET status = 'OCCUPIED' WHERE id = $1`, [bed102B.rows[0].id]);

    // 10. Auto-Create Tenant Record
    const tenantRes = await client.query(
      `INSERT INTO tenants (user_id, branch_id, booking_id, tenant_code, occupation, company_name, emergency_contact_name, emergency_contact_phone)
       VALUES ($1, $2, $3, 'TNT-1001', 'Software Engineer', 'Tech Corp', 'Ramesh Patel', '9876500000')
       RETURNING id`,
      [userId, branchId, bookingId]
    );
    const tenantId = tenantRes.rows[0].id;

    // 11. Record Initial Payment (Manual QR example)
    await client.query(
      `INSERT INTO payments (branch_id, user_id, booking_id, amount, payment_method, status, screenshot_url)
       VALUES ($1, $2, $3, 20500.00, 'MANUAL_QR', 'SUCCESS', 'https://example.com/screenshot.jpg')`,
      [branchId, userId, bookingId]
    );

    await client.query('COMMIT');
    console.log('✅ Database Seeding Completed Successfully!');
    console.log('\n--- DEMO ACCOUNTS ---');
    console.log('Super Admin: admin@pgmanagement.com / admin123');
    console.log('Company Admin: owner@comfortstays.com / owner123');
    console.log('Normal User (Tenant): tenant@gmail.com / tenant123');
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
