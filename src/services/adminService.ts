import pool from '../db/database';
import { hashPassword } from '../utils/password';

export class AdminService {
  // COMPANY ADMINS (Previously Owners)
  public static async createCompanyAdmin(data: any) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const pass = data.password || 'admin123';
      const password_hash = await hashPassword(pass);
      const userRes = await client.query(
        `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
        [data.full_name, data.email, data.mobile_number, password_hash]
      );
      const userId = userRes.rows[0].id;
      const roleRes = await client.query('SELECT id FROM roles WHERE name = \'COMPANY_ADMIN\'');
      if (roleRes.rows.length > 0) {
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleRes.rows[0].id]);
      }

      // Automatically create the initial property for the owner
      if (data.property_name) {
        await client.query(
          `INSERT INTO properties (owner_id, name, description) VALUES ($1, $2, $3)`,
          [userId, data.property_name, data.description || null]
        );
      }

      await client.query('COMMIT');
      return { id: userId, email: data.email, full_name: data.full_name };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async listCompanyAdmins() {
    const res = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, u.created_at
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.name = 'COMPANY_ADMIN' ORDER BY u.created_at DESC`
    );
    return res.rows;
  }

  public static async updateCompanyAdmin(id: string, data: any) {
    const res = await pool.query(
      `UPDATE users SET full_name = COALESCE($1, full_name), mobile_number = COALESCE($2, mobile_number), is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING id, full_name, email, is_active`,
      [data.full_name, data.mobile_number, data.is_active, id]
    );
    return res.rows[0];
  }

  // PROPERTIES
  public static async createProperty(data: any) {
    const res = await pool.query(
      `INSERT INTO properties (owner_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
      [data.owner_id, data.name, data.description || null]
    );
    return res.rows[0];
  }

  public static async listProperties() {
    const res = await pool.query(
      `SELECT p.*, u.full_name as owner_name FROM properties p JOIN users u ON p.owner_id = u.id ORDER BY p.created_at DESC`
    );
    return res.rows;
  }

  // BRANCHES
  public static async createBranch(data: any) {
    const amenitiesJson = JSON.stringify(data.amenities || []);
    const res = await pool.query(
      `INSERT INTO branches (property_id, name, address, city, state, contact_number, amenities)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [data.property_id, data.name || data.branch_name, data.address, data.city || null, data.state || null, data.contact_number || null, amenitiesJson]
    );
    return res.rows[0];
  }

  public static async listBranches() {
    const res = await pool.query(
      `SELECT b.*, p.name as property_name, u.full_name as owner_name
       FROM branches b
       JOIN properties p ON b.property_id = p.id
       JOIN users u ON p.owner_id = u.id
       ORDER BY b.created_at DESC`
    );
    return res.rows;
  }

  public static async updateBranch(id: string, data: any) {
    const res = await pool.query(
      `UPDATE branches SET name = COALESCE($1, name), address = COALESCE($2, address), contact_number = COALESCE($3, contact_number) WHERE id = $4 RETURNING *`,
      [data.name || data.branch_name, data.address, data.contact_number, id]
    );
    return res.rows[0];
  }

  public static async deleteBranch(id: string) {
    await pool.query('DELETE FROM branches WHERE id = $1', [id]);
    return { success: true };
  }

  // ALL USERS
  public static async listUsers() {
    const res = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, ARRAY_AGG(r.name) as roles, u.created_at
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    return res.rows;
  }

  // REPORTS
  public static async getGlobalReports() {
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const totalProperties = await pool.query('SELECT COUNT(*) FROM properties');
    const totalBranches = await pool.query('SELECT COUNT(*) FROM branches');
    const totalRevenue = await pool.query('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = \'SUCCESS\'');

    return {
      totalUsers: parseInt(totalUsers.rows[0].count),
      totalProperties: parseInt(totalProperties.rows[0].count),
      totalBranches: parseInt(totalBranches.rows[0].count),
      totalRevenue: parseFloat(totalRevenue.rows[0].coalesce),
    };
  }
}
