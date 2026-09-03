import pool from '../db/database';
import { hashPassword, comparePassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { RoleType } from '../types';

export class AuthService {
  public static async register(data: {
    full_name: string;
    email: string;
    mobile_number: string;
    password: string;
    role?: RoleType;
    branch_id?: string;
  }) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      // Check existing user
      const existing = await client.query(
        'SELECT id FROM users WHERE email = $1 OR mobile_number = $2',
        [data.email, data.mobile_number]
      );
      if (existing.rows.length > 0) {
        throw new Error('User with this email or mobile number already exists');
      }

      const password_hash = await hashPassword(data.password);

      // Insert User
      const userRes = await client.query(
        `INSERT INTO users (full_name, email, mobile_number, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, full_name, email, mobile_number, is_active`,
        [data.full_name, data.email, data.mobile_number, password_hash]
      );
      const user = userRes.rows[0];

      // Assign Role (default USER if not specified)
      const roleName = data.role || 'USER';
      const roleRes = await client.query('SELECT id FROM roles WHERE name = $1', [roleName]);
      if (roleRes.rows.length > 0) {
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [user.id, roleRes.rows[0].id]
        );
      } else {
        throw new Error(`Invalid role specified: ${roleName}`);
      }

      // Global registration completed (Tenant profile is created/copied to specific branch upon booking)

      await client.query('COMMIT');

      // Generate JWT Tokens
      const payload = { userId: user.id, email: user.email, roles: [roleName] };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // Store refresh token
      await pool.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
        [user.id, refreshToken]
      );

      return {
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          mobile_number: user.mobile_number,
          roles: [roleName],
        },
        accessToken,
        refreshToken,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async login(emailOrMobile: string, password: string) {
    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.password_hash, u.is_active,
              ARRAY_AGG(r.name) as roles
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE u.email = $1 OR u.mobile_number = $1
       GROUP BY u.id`,
      [emailOrMobile]
    );

    if (userRes.rows.length === 0) {
      throw new Error('Invalid email/mobile or password');
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      throw new Error('Account is deactivated. Please contact support.');
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      throw new Error('Invalid email/mobile or password');
    }

    const payload = { userId: user.id, email: user.email, roles: user.roles };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    return {
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        mobile_number: user.mobile_number,
        roles: user.roles,
      },
      accessToken,
      refreshToken,
    };
  }

  public static async refresh(token: string) {
    const decoded = verifyRefreshToken(token);
    const stored = await pool.query(
      'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (stored.rows.length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    const userRes = await pool.query(
      `SELECT u.id, u.email, ARRAY_AGG(r.name) as roles
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE u.id = $1 AND u.is_active = TRUE
       GROUP BY u.id`,
      [decoded.userId]
    );

    if (userRes.rows.length === 0) {
      throw new Error('User inactive or invalid');
    }

    const user = userRes.rows[0];
    const payload = { userId: user.id, email: user.email, roles: user.roles };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    // Rotate refresh token
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, newRefreshToken]
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  public static async logout(token: string) {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  }

  public static async changePassword(userId: string, oldPass: string, newPass: string) {
    const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) throw new Error('User not found');

    const match = await comparePassword(oldPass, userRes.rows[0].password_hash);
    if (!match) throw new Error('Incorrect current password');

    const newHash = await hashPassword(newPass);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
  }

  public static async toggleUserStatus(userId: string, is_active: boolean) {
    await pool.query('UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2', [is_active, userId]);
  }
}
