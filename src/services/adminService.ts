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
            `INSERT INTO branches (
               property_id, name, address, city, state, district, contact_number,
               latitude, longitude, pg_type, starting_monthly_rent, food_available,
               ac_available, description, amenities
             )
             VALUES (
               @propertyId, @name, @address, @city, @state, @district, @contactNumber,
               @latitude, @longitude, @pgType, @startingMonthlyRent, @foodAvailable,
               @acAvailable, @description, '[]'::jsonb
             ) RETURNING id`,
            {
              propertyId,
              name: branchName,
              address: data.address || data.city || 'Main Address',
              city: data.city || 'Bengaluru',
              state: data.state || 'Karnataka',
              district: data.district || null,
              contactNumber: data.contact_number || data.mobile_number || null,
              latitude: data.latitude ? parseFloat(data.latitude) : null,
              longitude: data.longitude ? parseFloat(data.longitude) : null,
              pgType: data.pg_type || 'UNISEX',
              startingMonthlyRent: parseFloat(data.starting_monthly_rent || 0),
              foodAvailable: data.food_available !== undefined ? (data.food_available === true || data.food_available === 'true') : true,
              acAvailable: data.ac_available !== undefined ? (data.ac_available === true || data.ac_available === 'true') : false,
              description: data.description || null,
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

      if (branchId) {
        await queryNamed(
          `UPDATE branches 
           SET subscription_status = 'ACTIVE',
               subscription_end_date = @endDate,
               plan_name = @planName
           WHERE id = @branchId`,
          {
            endDate: endDate.toISOString(),
            planName,
            branchId,
          },
          client
        );
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
    const propRes = await queryNamed(`SELECT id FROM properties WHERE owner_id = @ownerId LIMIT 1`, { ownerId });
    if (propRes.rows.length === 0) throw new Error('Property not found for this owner');
    const propertyId = propRes.rows[0].id;

    // Fetch all branches under this property
    const branchesRes = await queryNamed(
      `SELECT * FROM branches WHERE property_id = @propertyId ORDER BY created_at ASC`,
      { propertyId }
    );
    const allBranches = branchesRes.rows;

    let planId: string | null = data.plan_id || null;
    let durationMonths = parseInt(data.duration_months || data.subscription_months) || 2;
    let planName = data.plan_name || (
      durationMonths === 12 ? 'Annual (12 Months)' :
      durationMonths === 6 ? 'Half-Yearly (6 Months)' :
      durationMonths === 3 ? 'Quarterly (3 Months)' :
      'Starter Plan (2 Months)'
    );
    let planPrice = parseFloat(data.price || data.subscription_price || 0);
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

    const paymentMethod = data.payment_mode || data.payment_method || 'CASH';
    const paymentStatus = data.payment_status || 'PAID';
    const transactionId = data.payment_ref || data.transaction_id || `txn_${Date.now()}`;

    // Handle Downgrade / Branch Quota Logic
    const selectedBranchIds: string[] = Array.isArray(data.selected_branch_ids) ? data.selected_branch_ids : [];

    let activeBranchIds: string[] = [];
    let pausedBranchIds: string[] = [];

    if (selectedBranchIds.length > 0) {
      // User specified which branches to keep active (capped at maxBranches)
      activeBranchIds = selectedBranchIds.slice(0, maxBranches);
      pausedBranchIds = allBranches
        .map(b => b.id)
        .filter(id => !activeBranchIds.includes(id));
    } else if (allBranches.length > maxBranches) {
      // Automatic downgrade fallback if not explicitly chosen: keep first maxBranches, pause rest
      activeBranchIds = allBranches.slice(0, maxBranches).map(b => b.id);
      pausedBranchIds = allBranches.slice(maxBranches).map(b => b.id);
    } else {
      // All branches fit under plan quota
      activeBranchIds = allBranches.map(b => b.id);
      pausedBranchIds = [];
    }

    // Update active branches
    if (activeBranchIds.length > 0) {
      for (const bId of activeBranchIds) {
        await queryNamed(
          `UPDATE branches 
           SET is_active = TRUE,
               subscription_status = 'ACTIVE',
               subscription_end_date = @endDate,
               plan_name = @planName
           WHERE id = @bId`,
          {
            endDate: endDate.toISOString(),
            planName,
            bId,
          }
        );
      }
    }

    // Update paused branches (downgraded)
    if (pausedBranchIds.length > 0) {
      for (const bId of pausedBranchIds) {
        await queryNamed(
          `UPDATE branches 
           SET is_active = FALSE,
               subscription_status = 'PAUSED'
           WHERE id = @bId`,
          { bId }
        );
      }
    }

    // Insert new subscription record
    const newSub = await queryNamed(
      `INSERT INTO subscriptions (
         owner_id, property_id, plan_id, plan_name, duration_months, max_branches,
         start_date, end_date, status, price, payment_method, transaction_id, payment_status
       )
       VALUES (
         @ownerId, @propertyId, @planId, @planName, @durationMonths, @maxBranches,
         @startDate, @endDate, 'ACTIVE', @price, @paymentMethod, @transactionId, @paymentStatus
       )
       RETURNING *`,
      {
        ownerId,
        propertyId,
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

    // Record renewal payment for Total Revenue
    if (planPrice > 0) {
      const firstBranchId = activeBranchIds[0] || (allBranches.length > 0 ? allBranches[0].id : null);
      await queryNamed(
        `INSERT INTO payments (branch_id, user_id, amount, payment_method, transaction_id, status, remarks)
         VALUES (@branchId, @userId, @amount, @paymentMethod, @transactionId, @status, @remarks)`,
        {
          branchId: firstBranchId,
          userId: ownerId,
          amount: planPrice,
          paymentMethod,
          transactionId,
          status: paymentStatus === 'PAID' ? 'COMPLETED' : 'PENDING',
          remarks: `Owner Renewal: ${planName}`,
        }
      ).catch(e => console.warn('Could not record owner renewal payment:', e));
    }

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
      const imagesJson = JSON.stringify(data.images || []);
      const branchRes = await queryNamed(
        `INSERT INTO branches (
           property_id, name, address, city, state, contact_number, amenities,
           latitude, longitude, district, pg_type, starting_monthly_rent,
           food_available, ac_available, cover_image, images, description,
           subscription_status, subscription_end_date, plan_name
         )
         VALUES (
           @propertyId, @name, @address, @city, @state, @contactNumber, @amenities::jsonb,
           @latitude, @longitude, @district, @pgType, @startingMonthlyRent,
           @foodAvailable, @acAvailable, @coverImage, @images::jsonb, @description,
           'ACTIVE', @subscriptionEndDate, @planName
         ) RETURNING *`,
        {
          propertyId: data.property_id,
          name: data.name || data.branch_name,
          address: data.address,
          city: data.city || null,
          state: data.state || null,
          contactNumber: data.contact_number || null,
          amenities: amenitiesJson,
          latitude: data.latitude !== undefined && data.latitude !== '' ? parseFloat(data.latitude) : 12.9352,
          longitude: data.longitude !== undefined && data.longitude !== '' ? parseFloat(data.longitude) : 77.6245,
          district: data.district || null,
          pgType: data.pg_type || 'UNISEX',
          startingMonthlyRent: parseFloat(data.starting_monthly_rent || 0),
          foodAvailable: data.food_available !== undefined ? Boolean(data.food_available) : true,
          acAvailable: data.ac_available !== undefined ? Boolean(data.ac_available) : false,
          coverImage: data.cover_image || null,
          images: imagesJson,
          description: data.description || null,
          subscriptionEndDate: endDate.toISOString(),
          planName: planName,
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
              s.id as subscription_id, s.plan_id,
              COALESCE(b.plan_name, s.plan_name) as plan_name,
              s.duration_months, s.start_date,
              COALESCE(b.subscription_end_date, s.end_date) as end_date,
              COALESCE(b.subscription_end_date, s.end_date) as subscription_end_date,
              s.price as plan_price,
              CASE 
                WHEN COALESCE(b.subscription_end_date, s.end_date) IS NOT NULL AND COALESCE(b.subscription_end_date, s.end_date) < CURRENT_TIMESTAMP THEN TRUE 
                ELSE FALSE 
              END as is_expired,
              CASE 
                WHEN COALESCE(b.subscription_end_date, s.end_date) IS NULL THEN 0
                WHEN COALESCE(b.subscription_end_date, s.end_date) < CURRENT_TIMESTAMP THEN 0 
                ELSE GREATEST(0, EXTRACT(DAY FROM COALESCE(b.subscription_end_date, s.end_date) - CURRENT_TIMESTAMP)::INT) 
              END as days_remaining,
              CASE 
                WHEN b.subscription_status = 'PAUSED' OR b.is_active = FALSE THEN 'PAUSED'
                WHEN COALESCE(b.subscription_end_date, s.end_date) IS NULL THEN 'NO_PLAN'
                WHEN COALESCE(b.subscription_end_date, s.end_date) < CURRENT_TIMESTAMP THEN 'EXPIRED'
                ELSE COALESCE(b.subscription_status, s.status, 'ACTIVE')
              END as subscription_status
       FROM branches b
       JOIN properties p ON b.property_id = p.id
       JOIN users u ON p.owner_id = u.id
       LEFT JOIN LATERAL (
         SELECT * FROM subscriptions sub 
         WHERE sub.branch_id = b.id OR sub.property_id = p.id
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

    // Update branch table
    await queryNamed(
      `UPDATE branches 
       SET is_active = TRUE,
           subscription_status = 'ACTIVE',
           subscription_end_date = @endDate,
           plan_name = @planName
       WHERE id = @branchId`,
      {
        endDate: endDate.toISOString(),
        planName,
        branchId,
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

  public static async reactivateBranch(branchId: string) {
    const branchRes = await queryNamed(
      `SELECT b.*, p.owner_id FROM branches b JOIN properties p ON b.property_id = p.id WHERE b.id = @branchId`,
      { branchId }
    );
    if (branchRes.rows.length === 0) throw new Error('Branch not found');
    const branch = branchRes.rows[0];

    // Find active subscription for the property/owner
    const subRes = await queryNamed(
      `SELECT * FROM subscriptions 
       WHERE (branch_id = @branchId OR owner_id = @ownerId) 
         AND status = 'ACTIVE' 
         AND end_date > CURRENT_TIMESTAMP 
       ORDER BY created_at DESC LIMIT 1`,
      { branchId, ownerId: branch.owner_id }
    );

    if (subRes.rows.length === 0) {
      throw new Error('No active subscription found for this property. Please renew the property plan first.');
    }

    const activeSub = subRes.rows[0];
    const maxBranches = activeSub.max_branches || 1;

    // Count currently active branches under this property
    const countRes = await queryNamed(
      `SELECT COUNT(*) as count FROM branches 
       WHERE property_id = @propertyId AND is_active = TRUE AND subscription_status = 'ACTIVE'`,
      { propertyId: branch.property_id }
    );
    const activeCount = parseInt(countRes.rows[0].count);

    if (activeCount >= maxBranches) {
      throw new Error(`Quota limit reached (${activeCount}/${maxBranches} active branches). Upgrade plan or pause another branch first.`);
    }

    const updated = await queryNamed(
      `UPDATE branches 
       SET is_active = TRUE,
           subscription_status = 'ACTIVE',
           subscription_end_date = @endDate,
           plan_name = @planName
       WHERE id = @branchId
       RETURNING *`,
      {
        endDate: activeSub.end_date,
        planName: activeSub.plan_name,
        branchId,
      }
    );

    return updated.rows[0];
  }

  public static async updateBranch(id: string, data: any) {
    const res = await queryNamed(
      `UPDATE branches SET 
         name = COALESCE(@name, name), 
         address = COALESCE(@address, address), 
         city = COALESCE(@city, city),
         state = COALESCE(@state, state),
         district = COALESCE(@district, district),
         contact_number = COALESCE(@contact, contact_number),
         latitude = COALESCE(@latitude, latitude),
         longitude = COALESCE(@longitude, longitude),
         pg_type = COALESCE(@pgType, pg_type),
         starting_monthly_rent = COALESCE(@startingRent, starting_monthly_rent),
         food_available = COALESCE(@foodAvailable, food_available),
         ac_available = COALESCE(@acAvailable, ac_available),
         cover_image = COALESCE(@coverImage, cover_image),
         description = COALESCE(@description, description)
       WHERE id = @id RETURNING *`,
      { 
        name: data.name || data.branch_name || null, 
        address: data.address || null, 
        city: data.city || null,
        state: data.state || null,
        district: data.district || null,
        contact: data.contact_number || null,
        latitude: data.latitude !== undefined && data.latitude !== '' ? parseFloat(data.latitude) : null,
        longitude: data.longitude !== undefined && data.longitude !== '' ? parseFloat(data.longitude) : null,
        pgType: data.pg_type || null,
        startingRent: data.starting_monthly_rent !== undefined ? parseFloat(data.starting_monthly_rent) : null,
        foodAvailable: data.food_available !== undefined ? Boolean(data.food_available) : null,
        acAvailable: data.ac_available !== undefined ? Boolean(data.ac_available) : null,
        coverImage: data.cover_image || null,
        description: data.description || null,
        id 
      }
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
    const totalOwners = await queryNamed(
      `SELECT COUNT(DISTINCT u.id) as count FROM users u 
       JOIN user_roles ur ON u.id = ur.user_id 
       JOIN roles r ON ur.role_id = r.id 
       WHERE r.name = 'COMPANY_ADMIN'`,
      {}
    );
    const totalProperties = await queryNamed('SELECT COUNT(*) as count FROM properties', {});
    const totalBranches = await queryNamed('SELECT COUNT(*) as count FROM branches', {});
    const totalTenants = await queryNamed("SELECT COUNT(*) as count FROM tenants WHERE status = 'ACTIVE'", {});

    const payRes = await queryNamed(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM payments 
       WHERE UPPER(status) IN ('COMPLETED', 'SUCCESS', 'PAID')`,
      {}
    );
    const subRes = await queryNamed(
      `SELECT COALESCE(SUM(price), 0) as total 
       FROM subscriptions 
       WHERE UPPER(payment_status) = 'PAID' OR UPPER(status) = 'ACTIVE'`,
      {}
    );

    const payTotal = parseFloat(payRes.rows[0].total) || 0;
    const subTotal = parseFloat(subRes.rows[0].total) || 0;
    const totalRevenue = Math.max(payTotal, subTotal);

    const recentPaymentsRes = await queryNamed(
      `SELECT p.id, p.amount, p.payment_method, p.transaction_id, p.status, p.remarks, p.created_at,
              u.full_name as owner_name, u.email as owner_email,
              b.name as branch_name, prop.name as property_name
       FROM payments p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN branches b ON p.branch_id = b.id
       LEFT JOIN properties prop ON b.property_id = prop.id
       WHERE UPPER(p.status) IN ('COMPLETED', 'SUCCESS', 'PAID')
       ORDER BY p.created_at DESC LIMIT 10`,
      {}
    );

    return {
      totalUsers: parseInt(totalOwners.rows[0].count),
      totalOwners: parseInt(totalOwners.rows[0].count),
      totalProperties: parseInt(totalProperties.rows[0].count),
      totalBranches: parseInt(totalBranches.rows[0].count),
      totalTenants: parseInt(totalTenants.rows[0].count),
      totalRevenue,
      recentPayments: recentPaymentsRes.rows,
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
        smtp_host: '',
        smtp_port: '',
        smtp_username: '',
        smtp_display_name: '',
        mail: '',
        user_name: '',
        display_name: '',
        password: '',
        host: '',
        port: '',
      };
    }
    const row = res.rows[0];
    return {
      ...row,
      mail: row.mail || row.smtp_email || '',
      smtp_email: row.smtp_email || row.mail || '',
      user_name: row.user_name || row.smtp_username || '',
      smtp_username: row.smtp_username || row.user_name || '',
      display_name: row.display_name || row.smtp_display_name || '',
      smtp_display_name: row.smtp_display_name || row.display_name || '',
      password: row.password || row.smtp_password || '',
      smtp_password: row.smtp_password || row.password || '',
      host: row.host || row.smtp_host || '',
      smtp_host: row.smtp_host || row.host || '',
      port: row.port || row.smtp_port || '',
      smtp_port: row.smtp_port || row.port || '',
    };
  }

  public static async updateGeneralSettings(data: any) {
    const existing = await queryNamed(
      'SELECT id FROM branch_settings WHERE branch_id IS NULL LIMIT 1',
      {}
    );

    const mail = data.mail || data.smtp_email || null;
    const user_name = data.user_name || data.smtp_username || null;
    const display_name = data.display_name || data.smtp_display_name || null;
    const password = data.password || data.smtp_password || null;
    const host = data.host || data.smtp_host || null;
    const port = data.port || data.smtp_port || null;

    if (existing.rows.length > 0) {
      const res = await queryNamed(
        `UPDATE branch_settings
         SET razorpay_key = @razorpay_key,
             razorpay_secret = @razorpay_secret,
             upi_id = @upi_id,
             upi_qr_url = COALESCE(@upi_qr_url, upi_qr_url),
             smtp_email = @smtp_email,
             smtp_password = @smtp_password,
             smtp_host = @smtp_host,
             smtp_port = @smtp_port,
             smtp_username = @smtp_username,
             smtp_display_name = @smtp_display_name,
             mail = @mail,
             user_name = @user_name,
             display_name = @display_name,
             password = @password,
             host = @host,
             port = @port,
             updated_at = NOW()
         WHERE branch_id IS NULL
         RETURNING *`,
        {
          razorpay_key: data.razorpay_key || null,
          razorpay_secret: data.razorpay_secret || null,
          upi_id: data.upi_id || null,
          upi_qr_url: data.upi_qr_url || null,
          smtp_email: mail,
          smtp_password: password,
          smtp_host: host,
          smtp_port: port,
          smtp_username: user_name,
          smtp_display_name: display_name,
          mail: mail,
          user_name: user_name,
          display_name: display_name,
          password: password,
          host: host,
          port: port,
        }
      );
      return res.rows[0];
    } else {
      const res = await queryNamed(
        `INSERT INTO branch_settings (
           branch_id, razorpay_key, razorpay_secret, upi_id, upi_qr_url,
           smtp_email, smtp_password, smtp_host, smtp_port, smtp_username, smtp_display_name,
           mail, user_name, display_name, password, host, port, updated_at
         )
         VALUES (
           NULL, @razorpay_key, @razorpay_secret, @upi_id, @upi_qr_url,
           @smtp_email, @smtp_password, @smtp_host, @smtp_port, @smtp_username, @smtp_display_name,
           @mail, @user_name, @display_name, @password, @host, @port, NOW()
         )
         RETURNING *`,
        {
          razorpay_key: data.razorpay_key || null,
          razorpay_secret: data.razorpay_secret || null,
          upi_id: data.upi_id || null,
          upi_qr_url: data.upi_qr_url || null,
          smtp_email: mail,
          smtp_password: password,
          smtp_host: host,
          smtp_port: port,
          smtp_username: user_name,
          smtp_display_name: display_name,
          mail: mail,
          user_name: user_name,
          display_name: display_name,
          password: password,
          host: host,
          port: port,
        }
      );
      return res.rows[0];
    }
  }
}
