import pool from '../db/database';
import { hashPassword } from '../utils/password';
import path from 'path';
import fs from 'fs';

function saveBase64File(base64Data: string | undefined, prefix: string): string | null {
  if (!base64Data || typeof base64Data !== 'string') return null;
  if (!base64Data.startsWith('data:')) {
    return base64Data; // Already a URL or path
  }
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const matches = base64Data.match(/^data:(.+);base64,(.*)$/);
    if (!matches || matches.length !== 3) {
      return base64Data;
    }

    let ext = matches[1].split('/')[1] || 'png';
    if (ext.includes(';')) ext = ext.split(';')[0];
    if (ext === 'jpeg') ext = 'jpg';

    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e4)}.${ext}`;
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving base64 file:', err);
    return null;
  }
}

let cachedReports: { data: any; timestamp: number } | null = null;
let cachedOwners: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 15000;

function clearAdminCache() {
  cachedReports = null;
  cachedOwners = null;
}

export class AdminService {
  public static async createOwner(data: {
    full_name: string;
    email: string;
    mobile_number: string;
    password?: string;
    owner_code: string;
    business_name: string;
    contact_number: string;
    address: string;
    city: string;
    state?: string;
    country?: string;
    pincode?: string;
    property_name?: string;
    property_type?: 'PG' | 'RENTAL_HOUSE';
    logo?: string;
    description?: string;
    kyc_doc_type?: string;
    kyc_doc_number?: string;
    kyc_doc_url?: string;
  }) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 OR mobile_number = $2',
        [data.email, data.mobile_number]
      );
      if (existingUser.rows.length > 0) {
        throw new Error('User with email or mobile number already exists');
      }

      const rawPassword = (typeof data.password === 'string' && data.password.trim() !== '') ? data.password : 'Owner@123';
      const password_hash = await hashPassword(rawPassword);

      // Save files to uploads folder and get relative paths
      const logoPath = saveBase64File(data.logo, 'logo');
      const kycDocPath = saveBase64File(data.kyc_doc_url, 'kyc');

      // 1. Create User with OWNER role
      const userRes = await client.query(
        `INSERT INTO users (full_name, email, mobile_number, password_hash)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [data.full_name, data.email, data.mobile_number, password_hash]
      );
      const userId = userRes.rows[0].id;

      const roleRes = await client.query('SELECT id FROM roles WHERE name = $1', ['OWNER']);
      if (roleRes.rows.length > 0) {
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [userId, roleRes.rows[0].id]
        );
      }

      // 2. Create Property Owner record
      const ownerRes = await client.query(
        `INSERT INTO property_owners (user_id, owner_code, business_name, contact_number, email, address, city, state, country)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          userId,
          data.owner_code,
          data.business_name,
          data.contact_number,
          data.email,
          data.address,
          data.city,
          data.state || 'Karnataka',
          data.country || 'India',
        ]
      );
      const owner = ownerRes.rows[0];

      // 3. Auto-create Property for this Owner (1 Owner = 1 Property) with Logo & Description
      const propName = data.property_name || data.business_name;
      const propType = data.property_type || 'PG';

      const propRes = await client.query(
        `INSERT INTO properties (owner_id, property_name, property_type, description, logo, email, phone, address, city, state, country)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          owner.id,
          propName,
          propType,
          data.description || null,
          logoPath,
          data.email,
          data.contact_number,
          data.address,
          data.city,
          data.state || 'Karnataka',
          data.country || 'India',
        ]
      );
      const property = propRes.rows[0];

      // 4. Record Document / KYC Proof if provided
      if (kycDocPath || data.kyc_doc_number) {
        await client.query(
          `INSERT INTO documents (entity_type, entity_id, title, document_url, uploaded_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'PROPERTY',
            property.id,
            `${data.kyc_doc_type || 'KYC / Govt ID'} (${data.kyc_doc_number || 'N/A'})`,
            kycDocPath || 'https://placeholder.com/kyc-doc.pdf',
            userId,
          ]
        );
      }

      // 5. Auto-create initial Main Branch for this Property
      const branchCode = `BR-${Date.now().toString().slice(-4)}`;
      const branchName = `${propName} - Main Branch`;

      await client.query(
        `INSERT INTO branches (property_id, branch_code, branch_name, address, city, state, pincode, contact_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          property.id,
          branchCode,
          branchName,
          data.address,
          data.city,
          data.state || 'Karnataka',
          data.pincode || '560001',
          data.contact_number,
        ]
      );

      await client.query('COMMIT');
      clearAdminCache();
      return owner;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async listOwners() {
    if (cachedOwners && Date.now() - cachedOwners.timestamp < CACHE_TTL_MS) {
      return cachedOwners.data;
    }

    const res = await pool.query(
      `SELECT po.*, u.full_name, u.is_active as user_active,
              p.id as property_id, p.property_name, p.property_type,
              (SELECT COUNT(*) FROM branches b WHERE b.property_id = p.id)::int as branch_count
       FROM property_owners po
       JOIN users u ON po.user_id = u.id
       LEFT JOIN properties p ON p.owner_id = po.id
       ORDER BY po.created_at DESC`
    );
    cachedOwners = { data: res.rows, timestamp: Date.now() };
    return res.rows;
  }

  public static async createProperty(data: {
    owner_id: string;
    property_name: string;
    property_type: 'PG' | 'RENTAL_HOUSE';
    description?: string;
    logo?: string;
    email?: string;
    phone?: string;
    address: string;
    city: string;
    state: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  }) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT id FROM properties WHERE owner_id = $1',
        [data.owner_id]
      );

      if (existing.rows.length > 0) {
        throw new Error('This Property Owner already has an assigned property. Max limit is 1 property per owner.');
      }

      const res = await client.query(
        `INSERT INTO properties (owner_id, property_name, property_type, description, logo, email, phone, address, city, state, country, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          data.owner_id,
          data.property_name,
          data.property_type,
          data.description || null,
          data.logo || null,
          data.email || null,
          data.phone || null,
          data.address,
          data.city,
          data.state,
          data.country || 'India',
          data.latitude || null,
          data.longitude || null,
        ]
      );

      const property = res.rows[0];

      // Auto-create a default Branch for this Property in backend
      const branchCode = `BR-${Date.now().toString().slice(-4)}`;
      const branchName = `${property.property_name} - Main Branch`;

      await client.query(
        `INSERT INTO branches (property_id, branch_code, branch_name, address, city, state, pincode, contact_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          property.id,
          branchCode,
          branchName,
          data.address,
          data.city,
          data.state,
          '560001',
          data.phone || '9876543210',
        ]
      );

      await client.query('COMMIT');
      return property;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async listProperties() {
    const res = await pool.query(
      `SELECT p.*, po.business_name, u.full_name as owner_name,
              (SELECT COUNT(*) FROM branches b WHERE b.property_id = p.id) as branch_count
       FROM properties p
       JOIN property_owners po ON p.owner_id = po.id
       JOIN users u ON po.user_id = u.id
       ORDER BY p.created_at DESC`
    );
    return res.rows;
  }

  public static async createBranch(data: {
    property_id: string;
    branch_code?: string;
    branch_name: string;
    address: string;
    landmark?: string;
    city: string;
    state?: string;
    pincode?: string;
    contact_number?: string;
    email?: string;
    description?: string;
    latitude?: number;
    longitude?: number;
  }) {
    // Verify property exists
    const prop = await pool.query('SELECT id FROM properties WHERE id = $1', [data.property_id]);
    if (prop.rows.length === 0) {
      throw new Error('Target property not found');
    }

    const branchCode = data.branch_code || `BR-${Date.now().toString().slice(-4)}`;
    const pincode = data.pincode || '560001';
    const state = data.state || 'Karnataka';
    const contactNumber = data.contact_number || '9876543210';

    const res = await pool.query(
      `INSERT INTO branches (property_id, branch_code, branch_name, address, landmark, city, state, pincode, contact_number, email, description, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        data.property_id,
        branchCode,
        data.branch_name,
        data.address,
        data.landmark || null,
        data.city,
        state,
        pincode,
        contactNumber,
        data.email || null,
        data.description || null,
        data.latitude || null,
        data.longitude || null,
      ]
    );

    return res.rows[0];
  }

  public static async listBranches() {
    const res = await pool.query(
      `SELECT b.*, p.property_name, po.business_name as owner_business
       FROM branches b
       JOIN properties p ON b.property_id = p.id
       JOIN property_owners po ON p.owner_id = po.id
       ORDER BY b.created_at DESC`
    );
    return res.rows;
  }

  public static async listUsers() {
    const res = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, u.created_at,
              ARRAY_AGG(r.name) as roles
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    return res.rows;
  }

  public static async getGlobalReports() {
    if (cachedReports && Date.now() - cachedReports.timestamp < CACHE_TTL_MS) {
      return cachedReports.data;
    }

    const res = await pool.query(`
      SELECT 
        (SELECT COUNT(*)::int FROM property_owners) as total_owners,
        (SELECT COUNT(*)::int FROM properties) as total_properties,
        (SELECT COUNT(*)::int FROM branches) as total_branches,
        (SELECT COUNT(*)::int FROM rooms) as total_rooms,
        (SELECT COUNT(*)::int FROM beds) as total_beds,
        (SELECT COUNT(*)::int FROM tenants WHERE status = 'ACTIVE') as total_tenants,
        (SELECT COALESCE(SUM(amount), 0)::float FROM rent_payments WHERE payment_status = 'SUCCESS') as total_revenue
    `);

    const r = res.rows[0] || {};
    const result = {
      totalOwners: r.total_owners || 0,
      totalProperties: r.total_properties || 0,
      totalBranches: r.total_branches || 0,
      totalRooms: r.total_rooms || 0,
      totalBeds: r.total_beds || 0,
      totalTenants: r.total_tenants || 0,
      totalRevenue: r.total_revenue || 0,
    };
    cachedReports = { data: result, timestamp: Date.now() };
    return result;
  }

  public static async updateOwner(
    id: string,
    data: {
      full_name?: string;
      business_name?: string;
      contact_number?: string;
      email?: string;
      address?: string;
      city?: string;
      property_name?: string;
      property_type?: string;
      branch_id?: string;
      branch_name?: string;
      branch_address?: string;
      branch_city?: string;
    }
  ) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const ownerRes = await client.query('SELECT user_id FROM property_owners WHERE id = $1', [id]);
      if (ownerRes.rows.length === 0) {
        throw new Error('Owner not found');
      }
      const userId = ownerRes.rows[0].user_id;

      if (data.full_name || data.email || data.contact_number) {
        await client.query(
          `UPDATE users SET
            full_name = COALESCE($1, full_name),
            email = COALESCE($2, email),
            mobile_number = COALESCE($3, mobile_number),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [data.full_name || null, data.email || null, data.contact_number || null, userId]
        );
      }

      const updatedOwner = await client.query(
        `UPDATE property_owners SET
          business_name = COALESCE($1, business_name),
          contact_number = COALESCE($2, contact_number),
          email = COALESCE($3, email),
          address = COALESCE($4, address),
          city = COALESCE($5, city),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [
          data.business_name || null,
          data.contact_number || null,
          data.email || null,
          data.address || null,
          data.city || null,
          id,
        ]
      );

      // Update Property if property_name or property_type provided
      if (data.property_name || data.property_type) {
        await client.query(
          `UPDATE properties SET
            property_name = COALESCE($1, property_name),
            property_type = COALESCE($2, property_type),
            updated_at = CURRENT_TIMESTAMP
           WHERE owner_id = $3`,
          [data.property_name || null, data.property_type || null, id]
        );
      }

      // Update Branch if branch_id/branch_name provided
      if (data.branch_id && (data.branch_name || data.branch_address || data.branch_city)) {
        await client.query(
          `UPDATE branches SET
            branch_name = COALESCE($1, branch_name),
            address = COALESCE($2, address),
            city = COALESCE($3, city),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [data.branch_name || null, data.branch_address || null, data.branch_city || null, data.branch_id]
        );
      }

      await client.query('COMMIT');
      clearAdminCache();
      return updatedOwner.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async deleteOwner(id: string) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const ownerRes = await client.query('SELECT user_id FROM property_owners WHERE id = $1', [id]);
      if (ownerRes.rows.length === 0) {
        throw new Error('Owner not found');
      }
      const userId = ownerRes.rows[0].user_id;

      // Deleting user cascades to property_owners, properties, branches, etc.
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      await client.query('COMMIT');
      clearAdminCache();
      return { success: true, message: 'Owner deleted successfully' };
    } finally {
      client.release();
    }
  }

  public static async updateBranch(
    id: string,
    data: {
      branch_name?: string;
      address?: string;
      city?: string;
      contact_number?: string;
      landmark?: string;
      pincode?: string;
    }
  ) {
    const res = await pool.query(
      `UPDATE branches SET
        branch_name = COALESCE($1, branch_name),
        address = COALESCE($2, address),
        city = COALESCE($3, city),
        contact_number = COALESCE($4, contact_number),
        landmark = COALESCE($5, landmark),
        pincode = COALESCE($6, pincode),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        data.branch_name || null,
        data.address || null,
        data.city || null,
        data.contact_number || null,
        data.landmark || null,
        data.pincode || null,
        id,
      ]
    );
    if (res.rows.length === 0) {
      throw new Error('Branch not found');
    }
    return res.rows[0];
  }

  public static async deleteBranch(id: string) {
    const res = await pool.query('DELETE FROM branches WHERE id = $1 RETURNING *', [id]);
    if (res.rows.length === 0) {
      throw new Error('Branch not found');
    }
    return { success: true, message: 'Branch deleted successfully' };
  }
}


