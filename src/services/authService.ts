import pool, { queryNamed } from '../db/database';
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
      const existing = await queryNamed(
        'SELECT id FROM users WHERE email = @email OR mobile_number = @mobile',
        { email: data.email, mobile: data.mobile_number },
        client
      );
      if (existing.rows.length > 0) {
        throw new Error('User with this email or mobile number already exists');
      }

      const password_hash = await hashPassword(data.password);

      // Insert User
      const userRes = await queryNamed(
        `INSERT INTO users (full_name, email, mobile_number, password_hash)
         VALUES (@name, @email, @mobile, @hash)
         RETURNING id, full_name, email, mobile_number, is_active`,
        { name: data.full_name, email: data.email, mobile: data.mobile_number, hash: password_hash },
        client
      );
      const user = userRes.rows[0];

      // Assign Role (default USER if not specified)
      const roleName = data.role || 'USER';
      const roleRes = await queryNamed('SELECT id FROM roles WHERE name = @roleName', { roleName }, client);
      if (roleRes.rows.length > 0) {
        await queryNamed(
          'INSERT INTO user_roles (user_id, role_id) VALUES (@userId, @roleId)',
          { userId: user.id, roleId: roleRes.rows[0].id },
          client
        );
      } else {
        throw new Error(`Invalid role specified: ${roleName}`);
      }

      await client.query('COMMIT');

      // Generate JWT Tokens
      const payload = { userId: user.id, email: user.email, roles: [roleName] };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // Store refresh token
      await queryNamed(
        `INSERT INTO refresh_tokens (user_id, token, expires_at)
         VALUES (@userId, @token, NOW() + INTERVAL '7 days')`,
        { userId: user.id, token: refreshToken }
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
    const userRes = await queryNamed(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.password_hash, u.is_active,
              ARRAY_AGG(r.name) as roles
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE u.email = @identifier OR u.mobile_number = @identifier
       GROUP BY u.id`,
      { identifier: emailOrMobile }
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

    await queryNamed(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES (@userId, @token, NOW() + INTERVAL '7 days')`,
      { userId: user.id, token: refreshToken }
    );

    let subscription: any = null;
    if (user.roles.includes('COMPANY_ADMIN')) {
      const subRes = await queryNamed(
        `SELECT id, plan_name, duration_months, start_date, end_date, status,
                CASE WHEN end_date < CURRENT_TIMESTAMP THEN TRUE ELSE FALSE END as is_expired,
                GREATEST(0, EXTRACT(DAY FROM end_date - CURRENT_TIMESTAMP)::INT) as days_remaining
         FROM subscriptions
         WHERE owner_id = @userId
         ORDER BY created_at DESC
         LIMIT 1`,
        { userId: user.id }
      );
      if (subRes.rows.length > 0) {
        const sub = subRes.rows[0];
        subscription = {
          ...sub,
          status: sub.is_expired ? 'EXPIRED' : sub.status,
        };
      }
    }

    return {
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        mobile_number: user.mobile_number,
        roles: user.roles,
        subscription,
      },
      accessToken,
      refreshToken,
    };
  }

  public static async refresh(token: string) {
    const decoded = verifyRefreshToken(token);
    const stored = await queryNamed(
      'SELECT user_id FROM refresh_tokens WHERE token = @token AND expires_at > NOW()',
      { token }
    );

    if (stored.rows.length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    const userRes = await queryNamed(
      `SELECT u.id, u.email, ARRAY_AGG(r.name) as roles
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE u.id = @userId AND u.is_active = TRUE
       GROUP BY u.id`,
      { userId: decoded.userId }
    );

    if (userRes.rows.length === 0) {
      throw new Error('User inactive or invalid');
    }

    const user = userRes.rows[0];
    const payload = { userId: user.id, email: user.email, roles: user.roles };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    // Rotate refresh token
    await queryNamed('DELETE FROM refresh_tokens WHERE token = @token', { token });
    await queryNamed(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES (@userId, @token, NOW() + INTERVAL '7 days')`,
      { userId: user.id, token: newRefreshToken }
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  public static async logout(token: string) {
    await queryNamed('DELETE FROM refresh_tokens WHERE token = @token', { token });
  }

  public static async changePassword(userId: string, oldPass: string, newPass: string) {
    const userRes = await queryNamed('SELECT password_hash FROM users WHERE id = @userId', { userId });
    if (userRes.rows.length === 0) throw new Error('User not found');

    const match = await comparePassword(oldPass, userRes.rows[0].password_hash);
    if (!match) throw new Error('Incorrect current password');

    const newHash = await hashPassword(newPass);
    await queryNamed('UPDATE users SET password_hash = @newHash, updated_at = NOW() WHERE id = @userId', { newHash, userId });
  }

  public static async toggleUserStatus(userId: string, is_active: boolean) {
    await queryNamed('UPDATE users SET is_active = @isActive, updated_at = NOW() WHERE id = @userId', { isActive: is_active, userId });
  }
}
