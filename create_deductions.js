require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS booking_deductions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
          booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
          deduction_type VARCHAR(50) NOT NULL,
          amount NUMERIC(12, 2) NOT NULL,
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('booking_deductions table created successfully.');
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
