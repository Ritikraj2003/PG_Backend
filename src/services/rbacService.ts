import pool, { queryNamed } from '../db/database';
import { hashPassword } from '../utils/password';

export class RbacService {
  /**
   * List all available permissions
   */
  public static async getPermissions() {
    const res = await pool.query(
      `SELECT id::INT as id, permission_name, permission_code, created_by, created_on, last_modified_by, last_modified_on 
       FROM public.permissions 
       ORDER BY id ASC`
    );
    return res.rows;
  }

  /**
   * List roles accessible by company owner (built-in system roles + custom roles created by owner)
   */
  public static async getRoles(ownerId: string, branchId?: string) {
    const params: any[] = [ownerId];
    let branchFilter = '';
    if (branchId) {
      params.push(branchId);
      branchFilter = `AND (r.branch_id = $${params.length} OR r.branch_id IS NULL)`;
    }

    const res = await pool.query(
      `SELECT r.id, r.name, r.description, r.owner_id, r.created_by, r.created_on, r.is_active, r.branch_id,
              b.name as branch_name,
              COALESCE(ARRAY_AGG(DISTINCT rpm.permission_id) FILTER (WHERE rpm.permission_id IS NOT NULL), '{}') as permission_ids,
              (SELECT COUNT(*)::INT FROM user_roles ur WHERE ur.role_id = r.id) as staff_count
       FROM roles r
       LEFT JOIN role_permission_mapping rpm ON r.id = rpm.role_id
       LEFT JOIN branches b ON r.branch_id = b.id
       WHERE (r.owner_id = $1 OR r.owner_id IS NULL) ${branchFilter}
       GROUP BY r.id, b.name
       ORDER BY r.id ASC`,
      params
    );

    return res.rows;
  }

  /**
   * Create a new custom role for this owner and assign permissions in role_permission_mapping (with branch_id)
   */
  public static async createRole(
    ownerId: string,
    userId: string,
    data: { name: string; description?: string; permission_ids?: number[]; is_active?: boolean; branch_id?: string | null }
  ) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const isActive = data.is_active !== undefined ? data.is_active : true;
      const branchId = data.branch_id ? data.branch_id : null;

      const roleRes = await client.query(
        `INSERT INTO roles (name, description, owner_id, created_by, created_on, last_modified_by, last_modified_on, is_active, branch_id)
         VALUES ($1, $2, $3, $4, NOW(), $4, NOW(), $5, $6)
         RETURNING id, name, description, owner_id, is_active, created_on, branch_id`,
        [data.name.trim(), data.description || '', ownerId, userId, isActive, branchId]
      );
      const role = roleRes.rows[0];

      if (data.permission_ids && data.permission_ids.length > 0) {
        for (const permId of data.permission_ids) {
          await client.query(
            `INSERT INTO role_permission_mapping (role_id, permission_id, branch_id, created_by, created_on, last_modified_by, last_modified_on)
             VALUES ($1, $2, $3, $4, NOW(), $4, NOW())
             ON CONFLICT (role_id, permission_id) DO UPDATE SET 
               branch_id = EXCLUDED.branch_id, 
               last_modified_by = EXCLUDED.last_modified_by, 
               last_modified_on = NOW()`,
            [role.id, permId, branchId, userId]
          );
        }
      }

      await client.query('COMMIT');
      return {
        ...role,
        permission_ids: data.permission_ids || [],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing custom role and update role_permission_mapping (with branch_id)
   */
  public static async updateRole(
    ownerId: string,
    userId: string,
    roleId: number,
    data: { name: string; description?: string; permission_ids?: number[]; is_active?: boolean; branch_id?: string | null }
  ) {
    // Cannot edit built-in system roles
    const check = await pool.query('SELECT owner_id, branch_id FROM roles WHERE id = $1', [roleId]);
    if (check.rows.length === 0) {
      throw new Error('Role not found');
    }
    if (!check.rows[0].owner_id || check.rows[0].owner_id !== ownerId) {
      throw new Error('You do not have permission to modify this role');
    }

    const branchId = data.branch_id !== undefined ? (data.branch_id || null) : check.rows[0].branch_id;

    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const isActive = data.is_active !== undefined ? data.is_active : true;
      const roleRes = await client.query(
        `UPDATE roles
         SET name = $1, description = $2, is_active = $3, branch_id = $4, last_modified_by = $5, last_modified_on = NOW()
         WHERE id = $6 AND owner_id = $7
         RETURNING id, name, description, owner_id, is_active, created_on, last_modified_on, branch_id`,
        [data.name.trim(), data.description || '', isActive, branchId, userId, roleId, ownerId]
      );
      const role = roleRes.rows[0];

      if (data.permission_ids !== undefined) {
        await client.query('DELETE FROM role_permission_mapping WHERE role_id = $1', [roleId]);
        for (const permId of data.permission_ids) {
          await client.query(
            `INSERT INTO role_permission_mapping (role_id, permission_id, branch_id, created_by, created_on, last_modified_by, last_modified_on)
             VALUES ($1, $2, $3, $4, NOW(), $4, NOW())
             ON CONFLICT (role_id, permission_id) DO UPDATE SET 
               branch_id = EXCLUDED.branch_id, 
               last_modified_by = EXCLUDED.last_modified_by, 
               last_modified_on = NOW()`,
            [roleId, permId, branchId, userId]
          );
        }
      }

      await client.query('COMMIT');
      return {
        ...role,
        permission_ids: data.permission_ids || [],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a custom role
   */
  public static async deleteRole(ownerId: string, roleId: number) {
    const check = await pool.query('SELECT owner_id FROM roles WHERE id = $1', [roleId]);
    if (check.rows.length === 0) {
      throw new Error('Role not found');
    }
    if (!check.rows[0].owner_id || check.rows[0].owner_id !== ownerId) {
      throw new Error('Cannot delete system default roles');
    }

    const assigned = await pool.query(
      'SELECT COUNT(*)::INT as count FROM user_roles WHERE role_id = $1',
      [roleId]
    );
    if (assigned.rows[0].count > 0) {
      throw new Error(`Cannot delete role: ${assigned.rows[0].count} user(s) are currently assigned to this role.`);
    }

    await pool.query('DELETE FROM roles WHERE id = $1 AND owner_id = $2', [roleId, ownerId]);
    return { success: true, message: 'Role deleted successfully' };
  }

  /**
   * List staff members created under this company owner
   */
  public static async getStaff(ownerId: string) {
    const res = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, u.created_at,
              r.id as role_id, r.name as role_name,
              b.id as branch_id, b.name as branch_name
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       LEFT JOIN user_branches ub ON u.id = ub.user_id
       LEFT JOIN branches b ON ub.branch_id = b.id
       WHERE u.owner_id = $1
       ORDER BY u.created_at DESC`,
      [ownerId]
    );
    return res.rows;
  }

  /**
   * Create a new staff account under this owner
   */
  public static async createStaff(
    ownerId: string,
    data: {
      full_name: string;
      email: string;
      mobile_number: string;
      password: string;
      role_id: number;
      branch_id?: string;
    }
  ) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      // Check duplicate
      const exist = await client.query(
        'SELECT id FROM users WHERE email = $1 OR mobile_number = $2',
        [data.email.trim(), data.mobile_number.trim()]
      );
      if (exist.rows.length > 0) {
        throw new Error('User with this email or mobile number already exists');
      }

      const passwordHash = await hashPassword(data.password);

      const userRes = await client.query(
        `INSERT INTO users (full_name, email, mobile_number, password_hash, owner_id, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, full_name, email, mobile_number, is_active, created_at`,
        [data.full_name.trim(), data.email.trim(), data.mobile_number.trim(), passwordHash, ownerId]
      );
      const user = userRes.rows[0];

      // Assign custom/selected role
      await client.query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
        [user.id, data.role_id]
      );

      // Also ensure base STAFF role is assigned for system role authorization
      const staffRoleRes = await client.query("SELECT id FROM roles WHERE name = 'STAFF' LIMIT 1");
      if (staffRoleRes.rows.length > 0 && staffRoleRes.rows[0].id !== data.role_id) {
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [user.id, staffRoleRes.rows[0].id]
        );
      }

      // Assign branch if provided
      if (data.branch_id) {
        await client.query(
          'INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)',
          [user.id, data.branch_id]
        );
      }

      await client.query('COMMIT');

      // Fetch created staff details
      const detail = await pool.query(
        `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, u.created_at,
                r.id as role_id, r.name as role_name,
                b.id as branch_id, b.name as branch_name
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         LEFT JOIN roles r ON ur.role_id = r.id
         LEFT JOIN user_branches ub ON u.id = ub.user_id
         LEFT JOIN branches b ON ub.branch_id = b.id
         WHERE u.id = $1`,
        [user.id]
      );

      return detail.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Update staff account
   */
  public static async updateStaff(
    ownerId: string,
    staffId: string,
    data: {
      full_name?: string;
      mobile_number?: string;
      is_active?: boolean;
      role_id?: number;
      branch_id?: string;
      password?: string;
    }
  ) {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND owner_id = $2', [staffId, ownerId]);
    if (check.rows.length === 0) {
      throw new Error('Staff member not found');
    }

    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      if (data.full_name || data.mobile_number !== undefined || data.is_active !== undefined || data.password) {
        const updates: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (data.full_name) {
          updates.push(`full_name = $${idx++}`);
          values.push(data.full_name.trim());
        }
        if (data.mobile_number) {
          updates.push(`mobile_number = $${idx++}`);
          values.push(data.mobile_number.trim());
        }
        if (data.is_active !== undefined) {
          updates.push(`is_active = $${idx++}`);
          values.push(data.is_active);
        }
        if (data.password) {
          const newHash = await hashPassword(data.password);
          updates.push(`password_hash = $${idx++}`);
          values.push(newHash);
        }
        updates.push(`updated_at = NOW()`);
        values.push(staffId, ownerId);

        await client.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx++} AND owner_id = $${idx++}`,
          values
        );
      }

      if (data.role_id) {
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [staffId]);
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [staffId, data.role_id]);

        const staffRoleRes = await client.query("SELECT id FROM roles WHERE name = 'STAFF' LIMIT 1");
        if (staffRoleRes.rows.length > 0 && staffRoleRes.rows[0].id !== data.role_id) {
          await client.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [staffId, staffRoleRes.rows[0].id]
          );
        }
      }

      if (data.branch_id !== undefined) {
        await client.query('DELETE FROM user_branches WHERE user_id = $1', [staffId]);
        if (data.branch_id) {
          await client.query('INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)', [staffId, data.branch_id]);
        }
      }

      await client.query('COMMIT');

      const detail = await pool.query(
        `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, u.created_at,
                r.id as role_id, r.name as role_name,
                b.id as branch_id, b.name as branch_name
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         LEFT JOIN roles r ON ur.role_id = r.id
         LEFT JOIN user_branches ub ON u.id = ub.user_id
         LEFT JOIN branches b ON ub.branch_id = b.id
         WHERE u.id = $1`,
        [staffId]
      );
      return detail.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Delete staff account
   */
  public static async deleteStaff(ownerId: string, staffId: string) {
    const res = await pool.query('DELETE FROM users WHERE id = $1 AND owner_id = $2 RETURNING id', [staffId, ownerId]);
    if (res.rows.length === 0) {
      throw new Error('Staff member not found or already deleted');
    }
    return { success: true, message: 'Staff member deleted successfully' };
  }
}
