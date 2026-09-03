import pool, { queryNamed } from '../db/database';
import { hashPassword } from '../utils/password';

export class AdminService {
  // COMPANY ADMINS (Previously Owners)
  public static async createCompanyAdmin(data: any) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const pass = data.password || 'admin123';
      const password_hash = await hashPassword(pass);
      const userRes = await queryNamed(
        `INSERT INTO users (full_name, email, mobile_number, password_hash, is_active)
         VALUES (@fullName, @email, @mobile, @hash, TRUE) RETURNING id`,
        { fullName: data.full_name, email: data.email, mobile: data.mobile_number, hash: password_hash },
        client
      );
      const userId = userRes.rows[0].id;
      const roleRes = await queryNamed("SELECT id FROM roles WHERE name = 'COMPANY_ADMIN'", {}, client);
      if (roleRes.rows.length > 0) {
        await queryNamed('INSERT INTO user_roles (user_id, role_id) VALUES (@userId, @roleId)', { userId, roleId: roleRes.rows[0].id }, client);
      }

      // Automatically create the initial property for the owner
      if (data.property_name) {
        await queryNamed(
          `INSERT INTO properties (owner_id, name, description) VALUES (@ownerId, @name, @desc)`,
          { ownerId: userId, name: data.property_name, desc: data.description || null },
          client
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
    const res = await queryNamed(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, u.created_at
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.name = 'COMPANY_ADMIN' ORDER BY u.created_at DESC`,
      {}
    );
    return res.rows;
  }

  public static async updateCompanyAdmin(id: string, data: any) {
    const res = await queryNamed(
      `UPDATE users SET full_name = COALESCE(@fullName, full_name), mobile_number = COALESCE(@mobile, mobile_number), is_active = COALESCE(@isActive, is_active) WHERE id = @id RETURNING id, full_name, email, is_active`,
      { fullName: data.full_name || null, mobile: data.mobile_number || null, isActive: data.is_active ?? null, id }
    );
    return res.rows[0];
  }

  // PROPERTIES
  public static async createProperty(data: any) {
    const res = await queryNamed(
      `INSERT INTO properties (owner_id, name, description) VALUES (@ownerId, @name, @description) RETURNING *`,
      { ownerId: data.owner_id, name: data.name, description: data.description || null }
    );
    return res.rows[0];
  }

  public static async listProperties() {
    const res = await queryNamed(
      `SELECT p.*, u.full_name as owner_name FROM properties p JOIN users u ON p.owner_id = u.id ORDER BY p.created_at DESC`,
      {}
    );
    return res.rows;
  }

  // BRANCHES
  public static async createBranch(data: any) {
    const amenitiesJson = JSON.stringify(data.amenities || []);
    const res = await queryNamed(
      `INSERT INTO branches (property_id, name, address, city, state, contact_number, amenities)
       VALUES (@propertyId, @name, @address, @city, @state, @contactNumber, @amenities::jsonb) RETURNING *`,
      {
        propertyId: data.property_id,
        name: data.name || data.branch_name,
        address: data.address,
        city: data.city || null,
        state: data.state || null,
        contactNumber: data.contact_number || null,
        amenities: amenitiesJson,
      }
    );
    return res.rows[0];
  }

  public static async listBranches() {
    const res = await queryNamed(
      `SELECT b.*, p.name as property_name, u.full_name as owner_name
       FROM branches b
       JOIN properties p ON b.property_id = p.id
       JOIN users u ON p.owner_id = u.id
       ORDER BY b.created_at DESC`,
      {}
    );
    return res.rows;
  }

  public static async updateBranch(id: string, data: any) {
    const res = await queryNamed(
      `UPDATE branches SET name = COALESCE(@name, name), address = COALESCE(@address, address), contact_number = COALESCE(@contact, contact_number) WHERE id = @id RETURNING *`,
      { name: data.name || data.branch_name || null, address: data.address || null, contact: data.contact_number || null, id }
    );
    return res.rows[0];
  }

  public static async deleteBranch(id: string) {
    await queryNamed('DELETE FROM branches WHERE id = @id', { id });
    return { success: true };
  }

  // ALL USERS
  public static async listUsers() {
    const res = await queryNamed(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, ARRAY_AGG(r.name) as roles, u.created_at
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
      {}
    );
    return res.rows;
  }

  // REPORTS
  public static async getGlobalReports() {
    const totalUsers = await queryNamed('SELECT COUNT(*) FROM users', {});
    const totalProperties = await queryNamed('SELECT COUNT(*) FROM properties', {});
    const totalBranches = await queryNamed('SELECT COUNT(*) FROM branches', {});
    const totalRevenue = await queryNamed("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'SUCCESS'", {});

    return {
      totalUsers: parseInt(totalUsers.rows[0].count),
      totalProperties: parseInt(totalProperties.rows[0].count),
      totalBranches: parseInt(totalBranches.rows[0].count),
      totalRevenue: parseFloat(totalRevenue.rows[0].coalesce),
    };
  }
}
