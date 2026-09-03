require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const res = await pool.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, (SELECT id FROM roles WHERE name = 'USER')
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      WHERE ur.role_id IS NULL
    `);
    console.log('Fixed users:', res.rowCount);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
