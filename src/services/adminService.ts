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

      // Automatically create the initial property and primary branch for the owner
      let propertyId: string | null = null;
      let branchId: string | null = null;
      if (data.property_name) {
        const propRes = await queryNamed(
          `INSERT INTO properties (owner_id, name, description) VALUES (@ownerId, @name, @desc) RETURNING id`,
          { ownerId: userId, name: data.property_name, desc: data.description || null },
          client
        );
        if (propRes.rows.length > 0) {
          propertyId = propRes.rows[0].id;
          const branchName = data.branch_name || `${data.property_name} - Main`;
          const branchRes = await queryNamed(
            `INSERT INTO branches (property_id, name, address, city, state, contact_number, amenities)
             VALUES (@propertyId, @name, @address, @city, @state, @contactNumber, '[]'::jsonb) RETURNING id`,
            {
              propertyId,
              name: branchName,
              address: data.address || data.city || 'Main Address',
              city: data.city || 'Bengaluru',
              state: data.state || 'Karnataka',
              contactNumber: data.contact_number || data.mobile_number || null,
            },
            client
          );
          if (branchRes.rows.length > 0) {
            branchId = branchRes.rows[0].id;
          }
        }
      }

      // Resolve Subscription Plan
      let planId: string | null = data.plan_id || null;
      let durationMonths = parseInt(data.subscription_months || data.duration_months) || 2;
      let planName = data.plan_name || 'Starter Plan (2 Months)';
      let planPrice = parseFloat(data.price || data.subscription_price || 0);
      let maxBranches = 1;

      if (planId) {
        const pRes = await queryNamed(`SELECT * FROM subscription_plans WHERE id = @planId`, { planId }, client);
        if (pRes.rows.length > 0) {
          const p = pRes.rows[0];
          durationMonths = p.duration_months;
          planName = p.name;
          planPrice = parseFloat(p.price);
          maxBranches = p.max_branches;
        }
      } else {
        const pRes = await queryNamed(
          `SELECT * FROM subscription_plans WHERE duration_months = @durationMonths AND is_active = TRUE LIMIT 1`,
          { durationMonths },
          client
        );
        if (pRes.rows.length > 0) {
          planId = pRes.rows[0].id;
          planName = pRes.rows[0].name;
          planPrice = parseFloat(pRes.rows[0].price);
          maxBranches = pRes.rows[0].max_branches;
        }
      }

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);

      const paymentMethod = data.payment_mode || data.payment_method || 'CASH';
      const paymentStatus = data.payment_status || 'PAID';
      const transactionId = data.payment_ref || data.transaction_id || `txn_${Date.now()}`;

      const subRes = await queryNamed(
        `INSERT INTO subscriptions (owner_id, property_id, branch_id, plan_id, plan_name, duration_months, max_branches, start_date, end_date, status, price, payment_method, transaction_id, payment_status)
         VALUES (@ownerId, @propertyId, @branchId, @planId, @planName, @durationMonths, @maxBranches, @startDate, @endDate, 'ACTIVE', @price, @paymentMethod, @transactionId, @paymentStatus)
         RETURNING *`,
        {
          ownerId: userId,
          propertyId,
          branchId,
          planId,
          planName,
          durationMonths,
          maxBranches,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          price: planPrice,
          paymentMethod,
          transactionId,
          paymentStatus,
        },
        client
      );

      if (planPrice > 0) {
        await queryNamed(
          `INSERT INTO payments (branch_id, user_id, amount, payment_method, transaction_id, status, remarks)
           VALUES (@branchId, @userId, @amount, @paymentMethod, @transactionId, @status, @remarks)`,
          {
            branchId,
            userId,
            amount: planPrice,
            paymentMethod,
            transactionId,
            status: paymentStatus === 'PAID' ? 'COMPLETED' : 'PENDING',
            remarks: `Initial Subscription: ${planName}`,
          },
          client
        ).catch(e => console.warn('Could not record initial subscription payment:', e));
      }

      await client.query('COMMIT');
      return {
        id: userId,
        email: data.email,
        full_name: data.full_name,
        property_id: propertyId,
        branch_id: branchId,
        subscription: subRes.rows[0],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async listCompanyAdmins() {
    const res = await queryNamed(
      `SELECT u.id, u.full_name, u.email, u.mobile_number,
              u.mobile_number as contact_number,
              'OWN-' || UPPER(SUBSTRING(u.id::text, 1, 5)) as owner_code,
              u.is_active, u.created_at,
              p.id as property_id,
              p.name as property_name,
              p.name as business_name,
              p.description,
              COALESCE(br.city, 'Bengaluru') as city,
              COALESCE(br.state, 'Karnataka') as state,
              br.address,
              (SELECT COUNT(*) FROM branches b WHERE b.property_id = p.id)::int as total_branches,
              s.id as subscription_id, s.plan_name, s.duration_months, s.start_date, s.end_date,
              COALESCE(s.max_branches, 1)::int as max_branches,
              s.plan_id,
              CASE WHEN s.end_date IS NOT NULL AND s.end_date < CURRENT_TIMESTAMP THEN TRUE ELSE FALSE END as is_expired,
              CASE 
                WHEN s.end_date IS NULL THEN 0
                WHEN s.end_date < CURRENT_TIMESTAMP THEN 0 
                ELSE GREATEST(0, EXTRACT(DAY FROM s.end_date - CURRENT_TIMESTAMP)::INT) 
              END as days_remaining,
              CASE 
                WHEN s.end_date IS NULL THEN 'NO_PLAN'
                WHEN s.end_date < CURRENT_TIMESTAMP THEN 'EXPIRED'
                ELSE COALESCE(s.status, 'ACTIVE')
              END as subscription_status
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       LEFT JOIN properties p ON p.owner_id = u.id
       LEFT JOIN LATERAL (
         SELECT * FROM branches b 
         WHERE b.property_id = p.id 
         ORDER BY b.created_at ASC 
         LIMIT 1
       ) br ON TRUE
       LEFT JOIN LATERAL (
         SELECT * FROM subscriptions sub 
         WHERE sub.owner_id = u.id 
         ORDER BY sub.created_at DESC 
         LIMIT 1
       ) s ON TRUE
       WHERE r.name = 'COMPANY_ADMIN' 
       ORDER BY u.created_at DESC`,
      {}
    );
    return res.rows;
  }

  public static async renewOwnerSubscription(ownerId: string, data: any) {
    const durationMonths = parseInt(data.duration_months) || 2;
    const planName = data.plan_name || (
      durationMonths === 12 ? 'Annual (12 Months)' :
      durationMonths === 6 ? 'Half-Yearly (6 Months)' :
      durationMonths === 3 ? 'Quarterly (3 Months)' :
      'Starter (2 Months)'
    );

    const propRes = await queryNamed(`SELECT id FROM properties WHERE owner_id = @ownerId LIMIT 1`, { ownerId });
    const propertyId = propRes.rows.length > 0 ? propRes.rows[0].id : null;

    const latestSubRes = await queryNamed(
      `SELECT * FROM subscriptions WHERE owner_id = @ownerId ORDER BY created_at DESC LIMIT 1`,
      { ownerId }
    );

    let startDate = new Date();
    if (latestSubRes.rows.length > 0) {
      const latest = latestSubRes.rows[0];
      const prevEnd = new Date(latest.end_date);
      if (prevEnd > new Date()) {
        startDate = prevEnd;
      }
    }

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);

    const newSub = await queryNamed(
      `INSERT INTO subscriptions (owner_id, property_id, plan_name, duration_months, start_date, end_date, status, price)
       VALUES (@ownerId, @propertyId, @planName, @durationMonths, @startDate, @endDate, 'ACTIVE', @price)
       RETURNING *`,
      {
        ownerId,
        propertyId,
        planName,
        durationMonths,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        price: data.price || 0,
      }
    );
    return newSub.rows[0];
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
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const propRes = await queryNamed(`SELECT * FROM properties WHERE id = @propertyId`, { propertyId: data.property_id }, client);
      if (propRes.rows.length === 0) throw new Error('Property not found');
      const property = propRes.rows[0];
      const ownerId = property.owner_id;

      // Count existing branches
      const countRes = await queryNamed(`SELECT COUNT(*) as count FROM branches WHERE property_id = @propertyId`, { propertyId: data.property_id }, client);
      const existingBranchCount = parseInt(countRes.rows[0].count);

      // Check active property subscription
      const activeSubRes = await queryNamed(
        `SELECT * FROM subscriptions 
         WHERE property_id = @propertyId AND status = 'ACTIVE' AND end_date > CURRENT_TIMESTAMP 
         ORDER BY created_at DESC LIMIT 1`,
        { propertyId: data.property_id },
        client
      );
      const activeSub = activeSubRes.rows[0] || null;

      // Determine if this new branch is covered under the active plan's max_branches quota
      const isCovered = activeSub && (existingBranchCount < (activeSub.max_branches || 1));

      let planId: string | null = null;
      let durationMonths = 2;
      let planName = 'Starter Plan (2 Months)';
      let planPrice = 0;
      let maxBranches = 1;
      let startDate = new Date();
      let endDate = new Date();

      if (isCovered) {
        // Covered under the existing subscription plan:
        planId = activeSub.plan_id;
        planName = activeSub.plan_name;
        durationMonths = activeSub.duration_months;
        maxBranches = activeSub.max_branches;
        startDate = new Date();
        endDate = new Date(activeSub.end_date);
        planPrice = 0; // Included with zero extra cost
      } else {
        // Extra branch exceeding quota requires its own plan:
        planId = data.plan_id || null;
        durationMonths = parseInt(data.subscription_months || data.duration_months) || 2;
        planName = data.plan_name || 'Starter Plan (2 Months)';
        planPrice = parseFloat(data.price || data.subscription_price || 0);

        if (planId) {
          const pRes = await queryNamed(`SELECT * FROM subscription_plans WHERE id = @planId`, { planId }, client);
          if (pRes.rows.length > 0) {
            const p = pRes.rows[0];
            durationMonths = p.duration_months;
            planName = p.name;
            planPrice = parseFloat(p.price);
            maxBranches = p.max_branches;
          }
        } else {
          const pRes = await queryNamed(
            `SELECT * FROM subscription_plans WHERE duration_months = @durationMonths AND is_active = TRUE LIMIT 1`,
            { durationMonths },
            client
          );
          if (pRes.rows.length > 0) {
            planId = pRes.rows[0].id;
            planName = pRes.rows[0].name;
            planPrice = parseFloat(pRes.rows[0].price);
            maxBranches = pRes.rows[0].max_branches;
          }
        }

        startDate = new Date();
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + durationMonths);
      }

      const amenitiesJson = JSON.stringify(data.amenities || []);
      const branchRes = await queryNamed(
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
        },
        client
      );
      const branch = branchRes.rows[0];

      const paymentMethod = isCovered ? 'PLAN_INCLUDED' : (data.payment_mode || data.payment_method || 'CASH');
      const paymentStatus = isCovered ? 'PAID' : (data.payment_status || 'PAID');
      const transactionId = isCovered ? 'COVERED_BY_PLAN' : (data.payment_ref || data.transaction_id || `txn_${Date.now()}`);

      const subRes = await queryNamed(
        `INSERT INTO subscriptions (owner_id, property_id, branch_id, plan_id, plan_name, duration_months, max_branches, start_date, end_date, status, price, payment_method, transaction_id, payment_status)
         VALUES (@ownerId, @propertyId, @branchId, @planId, @planName, @durationMonths, @maxBranches, @startDate, @endDate, 'ACTIVE', @price, @paymentMethod, @transactionId, @paymentStatus)
         RETURNING *`,
        {
          ownerId,
          propertyId: data.property_id,
          branchId: branch.id,
          planId,
          planName,
          durationMonths,
          maxBranches,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          price: planPrice,
          paymentMethod,
          transactionId,
          paymentStatus,
        },
        client
      );

      if (planPrice > 0) {
        await queryNamed(
          `INSERT INTO payments (branch_id, user_id, amount, payment_method, transaction_id, status, remarks)
           VALUES (@branchId, @userId, @amount, @paymentMethod, @transactionId, @status, @remarks)`,
          {
            branchId: branch.id,
            userId: ownerId,
            amount: planPrice,
            paymentMethod,
            transactionId,
            status: paymentStatus === 'PAID' ? 'COMPLETED' : 'PENDING',
            remarks: `Branch Subscription: ${planName} (${branch.name})`,
          },
          client
        ).catch(e => console.warn('Could not record branch subscription payment:', e));
      }

      await client.query('COMMIT');
      return {
        ...branch,
        branch_name: branch.name,
        is_covered: isCovered,
        subscription: subRes.rows[0],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async listBranches() {
    const res = await queryNamed(
      `SELECT b.*, b.name as branch_name, p.name as property_name, u.full_name as owner_name, u.id as owner_id,
              s.id as subscription_id, s.plan_id, s.plan_name, s.duration_months, s.start_date, s.end_date, s.price as plan_price,
              CASE WHEN s.end_date IS NOT NULL AND s.end_date < CURRENT_TIMESTAMP THEN TRUE ELSE FALSE END as is_expired,
              CASE 
                WHEN s.end_date IS NULL THEN 0
                WHEN s.end_date < CURRENT_TIMESTAMP THEN 0 
                ELSE GREATEST(0, EXTRACT(DAY FROM s.end_date - CURRENT_TIMESTAMP)::INT) 
              END as days_remaining,
              CASE 
                WHEN s.end_date IS NULL THEN 'NO_PLAN'
                WHEN s.end_date < CURRENT_TIMESTAMP THEN 'EXPIRED'
                ELSE COALESCE(s.status, 'ACTIVE')
              END as subscription_status
       FROM branches b
       JOIN properties p ON b.property_id = p.id
       JOIN users u ON p.owner_id = u.id
       LEFT JOIN LATERAL (
         SELECT * FROM subscriptions sub 
         WHERE sub.branch_id = b.id 
         ORDER BY sub.created_at DESC 
         LIMIT 1
       ) s ON TRUE
       ORDER BY b.created_at DESC`,
      {}
    );
    return res.rows;
  }

  public static async renewBranchSubscription(branchId: string, data: any) {
    const branchRes = await queryNamed(
      `SELECT b.*, p.owner_id FROM branches b JOIN properties p ON b.property_id = p.id WHERE b.id = @branchId`,
      { branchId }
    );
    if (branchRes.rows.length === 0) throw new Error('Branch not found');
    const branch = branchRes.rows[0];

    let planId: string | null = data.plan_id || null;
    let durationMonths = parseInt(data.duration_months) || 2;
    let planName = data.plan_name || 'Starter Plan (2 Months)';
    let planPrice = parseFloat(data.price || 0);
    let maxBranches = 1;

    if (planId) {
      const pRes = await queryNamed(`SELECT * FROM subscription_plans WHERE id = @planId`, { planId });
      if (pRes.rows.length > 0) {
        const p = pRes.rows[0];
        durationMonths = p.duration_months;
        planName = p.name;
        planPrice = parseFloat(p.price);
        maxBranches = p.max_branches;
      }
    } else {
      const pRes = await queryNamed(
        `SELECT * FROM subscription_plans WHERE duration_months = @durationMonths AND is_active = TRUE LIMIT 1`,
        { durationMonths }
      );
      if (pRes.rows.length > 0) {
        planId = pRes.rows[0].id;
        planName = pRes.rows[0].name;
        planPrice = parseFloat(pRes.rows[0].price);
        maxBranches = pRes.rows[0].max_branches;
      }
    }

    const latestSubRes = await queryNamed(
      `SELECT * FROM subscriptions WHERE branch_id = @branchId ORDER BY created_at DESC LIMIT 1`,
      { branchId }
    );

    let startDate = new Date();
    if (latestSubRes.rows.length > 0) {
      const latest = latestSubRes.rows[0];
      const prevEnd = new Date(latest.end_date);
      if (prevEnd > new Date()) {
        startDate = prevEnd;
      }
    }

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);

    const paymentMethod = data.payment_mode || data.payment_method || 'CASH';
    const paymentStatus = data.payment_status || 'PAID';
    const transactionId = data.payment_ref || data.transaction_id || `txn_${Date.now()}`;

    const newSub = await queryNamed(
      `INSERT INTO subscriptions (owner_id, property_id, branch_id, plan_id, plan_name, duration_months, max_branches, start_date, end_date, status, price, payment_method, transaction_id, payment_status)
       VALUES (@ownerId, @propertyId, @branchId, @planId, @planName, @durationMonths, @maxBranches, @startDate, @endDate, 'ACTIVE', @price, @paymentMethod, @transactionId, @paymentStatus)
       RETURNING *`,
      {
        ownerId: branch.owner_id,
        propertyId: branch.property_id,
        branchId,
        planId,
        planName,
        durationMonths,
        maxBranches,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        price: planPrice,
        paymentMethod,
        transactionId,
        paymentStatus,
      }
    );

    if (planPrice > 0) {
      await queryNamed(
        `INSERT INTO payments (branch_id, user_id, amount, payment_method, transaction_id, status, remarks)
         VALUES (@branchId, @userId, @amount, @paymentMethod, @transactionId, @status, @remarks)`,
        {
          branchId,
          userId: branch.owner_id,
          amount: planPrice,
          paymentMethod,
          transactionId,
          status: paymentStatus === 'PAID' ? 'COMPLETED' : 'PENDING',
          remarks: `Branch Renewal: ${planName} (${branch.name})`,
        }
      ).catch(e => console.warn('Could not record branch renewal payment:', e));
    }

    return newSub.rows[0];
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

  // GENERAL SETTINGS (Stored in branch_settings with branch_id = NULL for SuperAdmin)
  public static async getGeneralSettings() {
    const res = await queryNamed(
      'SELECT * FROM branch_settings WHERE branch_id IS NULL LIMIT 1',
      {}
    );
    if (res.rows.length === 0) {
      return {
        id: null,
        branch_id: null,
        razorpay_key: '',
        razorpay_secret: '',
        upi_id: '',
        upi_qr_url: '',
        smtp_email: '',
        smtp_password: '',
      };
    }
    return res.rows[0];
  }

  public static async updateGeneralSettings(data: any) {
    const existing = await queryNamed(
      'SELECT id FROM branch_settings WHERE branch_id IS NULL LIMIT 1',
      {}
    );

    if (existing.rows.length > 0) {
      const res = await queryNamed(
        `UPDATE branch_settings
         SET razorpay_key = @razorpay_key,
             razorpay_secret = @razorpay_secret,
             upi_id = @upi_id,
             upi_qr_url = COALESCE(@upi_qr_url, upi_qr_url),
             smtp_email = @smtp_email,
             smtp_password = @smtp_password,
             updated_at = NOW()
         WHERE branch_id IS NULL
         RETURNING *`,
        {
          razorpay_key: data.razorpay_key || null,
          razorpay_secret: data.razorpay_secret || null,
          upi_id: data.upi_id || null,
          upi_qr_url: data.upi_qr_url || null,
          smtp_email: data.smtp_email || null,
          smtp_password: data.smtp_password || null,
        }
      );
      return res.rows[0];
    } else {
      const res = await queryNamed(
        `INSERT INTO branch_settings (branch_id, razorpay_key, razorpay_secret, upi_id, upi_qr_url, smtp_email, smtp_password, updated_at)
         VALUES (NULL, @razorpay_key, @razorpay_secret, @upi_id, @upi_qr_url, @smtp_email, @smtp_password, NOW())
         RETURNING *`,
        {
          razorpay_key: data.razorpay_key || null,
          razorpay_secret: data.razorpay_secret || null,
          upi_id: data.upi_id || null,
          upi_qr_url: data.upi_qr_url || null,
          smtp_email: data.smtp_email || null,
          smtp_password: data.smtp_password || null,
        }
      );
      return res.rows[0];
    }
  }
}
