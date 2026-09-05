import pool, { queryNamed } from '../db/database';
import { hashPassword } from '../utils/password';

export class OwnerService {
  // DASHBOARD
  public static async getDashboardData(ownerId: string, targetBranchId?: string) {
    const propRes = await queryNamed('SELECT id, name, description FROM properties WHERE owner_id = @ownerId', { ownerId });
    if (propRes.rows.length === 0) return { property: null, branches: [], summary: {} };
    const property = propRes.rows[0];

    const branchesRes = await queryNamed(
      `SELECT b.*, b.name as branch_name,
              s.id as subscription_id, s.plan_id, s.plan_name, s.duration_months, s.start_date, s.end_date, s.price as subscription_price,
              CASE 
                WHEN s.end_date IS NULL THEN 'NO_SUBSCRIPTION'
                WHEN s.end_date < CURRENT_TIMESTAMP THEN 'EXPIRED'
                ELSE COALESCE(s.status, 'ACTIVE')
              END as subscription_status,
              CASE WHEN s.end_date < CURRENT_TIMESTAMP THEN TRUE ELSE FALSE END as is_expired,
              GREATEST(0, EXTRACT(DAY FROM COALESCE(s.end_date, CURRENT_TIMESTAMP) - CURRENT_TIMESTAMP)::INT) as days_remaining
       FROM branches b
       LEFT JOIN LATERAL (
         SELECT * FROM subscriptions 
         WHERE branch_id = b.id OR (branch_id IS NULL AND property_id = b.property_id)
         ORDER BY created_at DESC 
         LIMIT 1
       ) s ON true
       WHERE b.property_id = @propertyId
       ORDER BY b.created_at ASC`,
      { propertyId: property.id }
    );
    const allBranchIds = branchesRes.rows.map(b => b.id);

    if (allBranchIds.length === 0) {
      return {
        property,
        branches: [],
        subscription: null,
        summary: { totalBranches: 0, totalRooms: 0, totalBeds: 0, activeTenants: 0, totalRevenue: 0, pendingRent: 0 },
      };
    }

    let activeBranchId = targetBranchId;
    if (!activeBranchId || !allBranchIds.includes(activeBranchId)) {
      activeBranchId = allBranchIds[0];
    }
    const activeBranch = branchesRes.rows.find(b => b.id === activeBranchId);

    const subscription = activeBranch ? {
      id: activeBranch.subscription_id,
      plan_id: activeBranch.plan_id,
      plan_name: activeBranch.plan_name,
      duration_months: activeBranch.duration_months,
      start_date: activeBranch.start_date,
      end_date: activeBranch.end_date,
      price: activeBranch.subscription_price,
      status: activeBranch.subscription_status,
      is_expired: activeBranch.is_expired,
      days_remaining: activeBranch.days_remaining,
    } : null;

    const roomsRes = await queryNamed('SELECT COUNT(*) as count FROM rooms WHERE branch_id = @branchId', { branchId: activeBranchId });
    const bedsRes = await queryNamed("SELECT COUNT(*) as count, COUNT(CASE WHEN status='OCCUPIED' THEN 1 END) as occupied FROM beds WHERE room_id IN (SELECT id FROM rooms WHERE branch_id = @branchId)", { branchId: activeBranchId });
    const tenantsRes = await queryNamed("SELECT COUNT(*) as count FROM tenants WHERE branch_id = @branchId AND status = 'ACTIVE'", { branchId: activeBranchId });
    const revenueRes = await queryNamed("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE branch_id = @branchId AND status = 'SUCCESS'", { branchId: activeBranchId });
    const pendingRentRes = await queryNamed("SELECT COALESCE(SUM(total_amount), 0) as total FROM rent_invoices WHERE branch_id = @branchId AND status != 'PAID'", { branchId: activeBranchId }); 

    return {
      property,
      branch: activeBranch,
      branches: branchesRes.rows,
      selectedBranchId: activeBranchId,
      subscription,
      summary: {
        totalBranches: branchesRes.rows.length,
        totalRooms: parseInt(roomsRes.rows[0].count),
        totalBeds: parseInt(bedsRes.rows[0].count),
        occupiedBeds: parseInt(bedsRes.rows[0].occupied),
        activeTenants: parseInt(tenantsRes.rows[0].count),
        totalRevenue: parseFloat(revenueRes.rows[0].total),
        pendingRent: parseFloat(pendingRentRes.rows[0].total),
      },
    };
  }

  public static async renewSubscription(ownerId: string, data: any) {
    let branchId = data.branch_id;
    let planId = data.plan_id;
    let durationMonths = parseInt(data.duration_months);
    let planName = data.plan_name;
    let price = data.price;
    let maxBranches = 1;

    if (planId) {
      const planRes = await queryNamed(`SELECT * FROM subscription_plans WHERE id = @planId`, { planId });
      if (planRes.rows.length > 0) {
        const p = planRes.rows[0];
        planName = p.name;
        durationMonths = p.duration_months;
        price = p.price;
        maxBranches = p.max_branches;
      }
    }

    if (!durationMonths) durationMonths = 2;
    if (!planName) {
      planName = durationMonths === 12 ? 'Annual Plan (12 Months)' :
                 durationMonths === 6 ? 'Half-Yearly Plan (6 Months)' :
                 durationMonths === 3 ? 'Quarterly Plan (3 Months)' : 'Starter Plan (2 Months)';
    }

    const propRes = await queryNamed(`SELECT id FROM properties WHERE owner_id = @ownerId LIMIT 1`, { ownerId });
    const propertyId = propRes.rows.length > 0 ? propRes.rows[0].id : null;

    if (!branchId) {
      const bRes = await queryNamed(`SELECT b.id FROM branches b JOIN properties p ON b.property_id = p.id WHERE p.owner_id = @ownerId LIMIT 1`, { ownerId });
      if (bRes.rows.length > 0) branchId = bRes.rows[0].id;
    }

    let startDate = new Date();
    if (branchId) {
      const latestSubRes = await queryNamed(
        `SELECT * FROM subscriptions WHERE branch_id = @branchId ORDER BY created_at DESC LIMIT 1`,
        { branchId }
      );
      if (latestSubRes.rows.length > 0) {
        const latest = latestSubRes.rows[0];
        const prevEnd = new Date(latest.end_date);
        if (prevEnd > new Date()) {
          startDate = prevEnd;
        }
      }
    }

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);

    const paymentMethod = data.payment_method || data.payment_mode || 'ONLINE';
    const paymentStatus = data.payment_status || 'PAID';
    const transactionId = data.transaction_id || data.razorpay_payment_id || data.payment_ref || `txn_${Date.now()}`;

    const newSub = await queryNamed(
      `INSERT INTO subscriptions (owner_id, property_id, branch_id, plan_id, plan_name, duration_months, max_branches, start_date, end_date, status, price, payment_method, transaction_id, payment_status)
       VALUES (@ownerId, @propertyId, @branchId, @planId, @planName, @durationMonths, @maxBranches, @startDate, @endDate, 'ACTIVE', @price, @paymentMethod, @transactionId, @paymentStatus)
       RETURNING *`,
      {
        ownerId,
        propertyId,
        branchId,
        planId: planId || null,
        planName,
        durationMonths,
        maxBranches,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        price: price || 0,
        paymentMethod,
        transactionId,
        paymentStatus,
      }
    );

    if (price && parseFloat(price) > 0) {
      await queryNamed(
        `INSERT INTO payments (branch_id, user_id, amount, payment_method, transaction_id, status, remarks)
         VALUES (@branchId, @userId, @amount, @paymentMethod, @transactionId, @status, @remarks)`,
        {
          branchId,
          userId: ownerId,
          amount: parseFloat(price),
          paymentMethod,
          transactionId,
          status: paymentStatus === 'PAID' ? 'COMPLETED' : 'PENDING',
          remarks: `Branch Renewal: ${planName}`,
        }
      ).catch(e => console.warn('Could not record payment row in renewSubscription:', e));
    }

    return newSub.rows[0];
  }

  public static async getPlatformPaymentInfo() {
    const res = await queryNamed(
      `SELECT razorpay_key, upi_id, upi_qr_url, smtp_email 
       FROM branch_settings 
       WHERE branch_id IS NULL 
       LIMIT 1`,
      {}
    );
    if (res.rows.length === 0) {
      return {
        razorpay_key: '',
        upi_id: '',
        upi_qr_url: '',
      };
    }
    const row = res.rows[0];
    return {
      razorpay_key: row.razorpay_key || '',
      upi_id: row.upi_id || '',
      upi_qr_url: row.upi_qr_url || '',
    };
  }

  public static async getOwnerBranches(ownerId: string) {
    const res = await queryNamed(
      `SELECT b.*, b.name as branch_name,
              s.id as subscription_id, s.plan_id, s.plan_name, s.duration_months, s.start_date, s.end_date, s.price as subscription_price,
              CASE 
                WHEN s.end_date IS NULL THEN 'NO_SUBSCRIPTION'
                WHEN s.end_date < CURRENT_TIMESTAMP THEN 'EXPIRED'
                ELSE COALESCE(s.status, 'ACTIVE')
              END as subscription_status,
              CASE WHEN s.end_date < CURRENT_TIMESTAMP THEN TRUE ELSE FALSE END as is_expired,
              GREATEST(0, EXTRACT(DAY FROM COALESCE(s.end_date, CURRENT_TIMESTAMP) - CURRENT_TIMESTAMP)::INT) as days_remaining
       FROM branches b
       JOIN properties p ON b.property_id = p.id
       LEFT JOIN LATERAL (
         SELECT * FROM subscriptions 
         WHERE branch_id = b.id OR (branch_id IS NULL AND property_id = b.property_id)
         ORDER BY created_at DESC 
         LIMIT 1
       ) s ON true
       WHERE p.owner_id = @ownerId
       ORDER BY b.created_at DESC`,
      { ownerId }
    );
    return res.rows;
  }

  // BRANCH SETTINGS
  public static async getBranchSettings(branchId: string) {
    const res = await queryNamed('SELECT * FROM branch_settings WHERE branch_id = @branchId', { branchId });
    return res.rows[0] || null;
  }

  public static async updateBranchSettings(branchId: string, data: any) {
    const res = await queryNamed(
      `INSERT INTO branch_settings (branch_id, razorpay_key, razorpay_secret, upi_id, upi_qr_url, smtp_email, smtp_password)
       VALUES (@branchId, @razorpayKey, @razorpaySecret, @upiId, @upiQrUrl, @smtpEmail, @smtpPassword)
       ON CONFLICT (branch_id) DO UPDATE SET
         razorpay_key = EXCLUDED.razorpay_key,
         razorpay_secret = EXCLUDED.razorpay_secret,
         upi_id = EXCLUDED.upi_id,
         upi_qr_url = COALESCE(EXCLUDED.upi_qr_url, branch_settings.upi_qr_url),
         smtp_email = EXCLUDED.smtp_email,
         smtp_password = EXCLUDED.smtp_password,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      {
        branchId,
        razorpayKey: data.razorpay_key || null,
        razorpaySecret: data.razorpay_secret || null,
        upiId: data.upi_id || null,
        upiQrUrl: data.upi_qr_url || null,
        smtpEmail: data.smtp_email || null,
        smtpPassword: data.smtp_password || null,
      }
    );
    return res.rows[0];
  }

  // ROOMS & BEDS
  public static async createRoom(data: any) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const res = await queryNamed(
        `INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit)
         VALUES (@branchId, @floorNumber, @roomNumber, @roomType, @monthlyRent, @securityDeposit) RETURNING *`,
        {
          branchId: data.branch_id,
          floorNumber: data.floor_number || 1,
          roomNumber: data.room_number,
          roomType: data.room_type,
          monthlyRent: data.monthly_rent || 0,
          securityDeposit: data.security_deposit || 0,
        },
        client
      );
      const room = res.rows[0];
      const bedCount = data.capacity ? parseInt(data.capacity) : 1;
      for (let i = 1; i <= bedCount; i++) {
        await queryNamed(
          `INSERT INTO beds (room_id, bed_number, status) VALUES (@roomId, @bedNumber, 'AVAILABLE') ON CONFLICT DO NOTHING`,
          { roomId: room.id, bedNumber: `${data.room_number}-B${i}` },
          client
        );
      }
      await client.query('COMMIT');
      return room;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async getRooms(branchId: string) {
    const res = await queryNamed(
      `SELECT r.*,
        (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.id) as total_beds,
        (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.id AND bd.status = 'AVAILABLE') as available_beds,
        COALESCE((SELECT json_agg(bd) FROM beds bd WHERE bd.room_id = r.id), '[]'::json) as beds
       FROM rooms r WHERE r.branch_id = @branchId ORDER BY r.floor_number ASC, r.room_number ASC`,
      { branchId }
    );
    return res.rows;
  }

  public static async createBed(data: any) {
    const res = await queryNamed(
      `INSERT INTO beds (room_id, bed_number) VALUES (@roomId, @bedNumber) RETURNING *`,
      { roomId: data.room_id, bedNumber: data.bed_number }
    );
    return res.rows[0];
  }

  public static async getBeds(roomId: string) {
    const res = await queryNamed('SELECT * FROM beds WHERE room_id = @roomId ORDER BY bed_number ASC', { roomId });
    return res.rows;
  }

  public static async updateBed(id: string, data: any) {
    const res = await queryNamed(
      `UPDATE beds SET bed_number = COALESCE(@bedNumber, bed_number), status = COALESCE(@status, status) WHERE id = @id RETURNING *`,
      { bedNumber: data.bed_number || null, status: data.status || null, id }
    );
    return res.rows[0];
  }

  public static async deleteBed(id: string) {
    const res = await queryNamed('DELETE FROM beds WHERE id = @id RETURNING *', { id });
    return res.rows[0];
  }

  // TENANTS & BOOKINGS
  public static async getTenants(branchId: string) {
    const res = await queryNamed(
      `SELECT t.*, 
              u.full_name, 
              u.full_name as user_name, 
              u.email as user_email, 
              u.mobile_number as user_mobile,
              r.room_number,
              r.room_type,
              r.monthly_rent
       FROM tenants t 
       JOIN users u ON t.user_id = u.id 
       LEFT JOIN bookings b ON t.booking_id = b.id
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE t.branch_id = @branchId 
       ORDER BY t.created_at DESC`,
      { branchId }
    );
    return res.rows;
  }

  public static async getBookings(branchId: string) {
    const res = await queryNamed(
      `SELECT b.*, u.full_name, u.email, u.mobile_number, r.room_number, r.room_type, r.monthly_rent, r.security_deposit, bd.bed_number
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN rooms r ON b.room_id = r.id
       LEFT JOIN beds bd ON b.bed_id = bd.id
       WHERE b.branch_id = @branchId ORDER BY b.booking_date DESC`,
      { branchId }
    );
    return res.rows;
  }

  public static async updateBookingStatus(bookingId: string, status: string, remarks?: string, refundAmount?: number) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const bRes = await queryNamed('SELECT * FROM bookings WHERE id = @bookingId FOR UPDATE', { bookingId }, client);
      if (bRes.rows.length === 0) throw new Error('Booking not found');
      const booking = bRes.rows[0];

      if (status === 'APPROVED' && booking.status === 'PENDING') {
        // Just status update
      } else if (status === 'PAID' && booking.status === 'APPROVED') {
        // Tenant is active now
        if (booking.bed_id) await queryNamed("UPDATE beds SET status = 'OCCUPIED' WHERE id = @bedId", { bedId: booking.bed_id }, client);
        
        await queryNamed(
          `INSERT INTO tenants (user_id, branch_id, booking_id, tenant_code, status)
           VALUES (@userId, @branchId, @bookingId, @tenantCode, 'ACTIVE') ON CONFLICT DO NOTHING`,
          {
            userId: booking.user_id,
            branchId: booking.branch_id,
            bookingId: booking.id,
            tenantCode: `TNT-${Math.floor(1000 + Math.random() * 9000)}`,
          },
          client
        );
      } else if (status === 'CHECKED_OUT') {
        if (booking.bed_id) await queryNamed("UPDATE beds SET status = 'AVAILABLE' WHERE id = @bedId", { bedId: booking.bed_id }, client);
        await queryNamed("UPDATE tenants SET status = 'CHECKED_OUT' WHERE booking_id = @bookingId", { bookingId: booking.id }, client);
        await queryNamed('UPDATE bookings SET actual_check_out_date = CURRENT_DATE, refund_amount = COALESCE(@refundAmount, 0) WHERE id = @bookingId', { refundAmount: refundAmount || 0, bookingId: booking.id }, client);
      } else if (status === 'CANCELLED' || status === 'REJECTED') {
        if (booking.bed_id) await queryNamed("UPDATE beds SET status = 'AVAILABLE' WHERE id = @bedId", { bedId: booking.bed_id }, client);
      }

      const res = await queryNamed(
        `UPDATE bookings SET status = @status, checkout_remarks = COALESCE(@remarks, checkout_remarks), updated_at = NOW() WHERE id = @bookingId RETURNING *`,
        { status, remarks: remarks || null, bookingId },
        client
      );
      await client.query('COMMIT');
      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // RENT & PAYMENTS
  public static async createRentInvoice(data: any) {
    const rent = Number(data.rent_amount || 0);
    const maint = Number(data.maintenance_amount || 0);
    const elec = Number(data.electricity_amount || 0);
    const water = Number(data.water_amount || 0);
    const food = Number(data.food_amount || 0);
    const other = Number(data.other_amount || 0);
    const total = data.total_amount ? Number(data.total_amount) : (rent + maint + elec + water + food + other);

    const res = await queryNamed(
      `INSERT INTO rent_invoices (branch_id, tenant_id, invoice_month, due_date, rent_amount, maintenance_amount, total_amount, status)
       VALUES (@branchId, @tenantId, @invoiceMonth, @dueDate, @rentAmount, @maintenanceAmount, @totalAmount, 'PENDING') RETURNING *`,
      {
        branchId: data.branch_id,
        tenantId: data.tenant_id,
        invoiceMonth: data.billing_month || data.invoice_month || new Date().toISOString().slice(0, 7),
        dueDate: data.due_date || new Date(Date.now() + 7 * 86400000),
        rentAmount: rent,
        maintenanceAmount: maint + elec + water + food + other,
        totalAmount: total,
      }
    );

    try {
      const tRes = await queryNamed('SELECT user_id FROM tenants WHERE id = @tenantId', { tenantId: data.tenant_id });
      if (tRes.rows.length > 0 && tRes.rows[0].user_id) {
        const { NotificationService } = require('./notificationService');
        await NotificationService.sendPushNotification(
          tRes.rows[0].user_id,
          'New Rent Invoice Generated',
          `Your invoice for ${data.billing_month || data.invoice_month || 'Rent'} of amount ₹${total} has been generated. Due date: ${data.due_date || 'Within 7 days'}.`,
          'BILLING'
        );
      }
    } catch (err) {
      console.warn('Could not send invoice notification:', err);
    }

    return res.rows[0];
  }

  public static async generateBulkInvoices(branchId: string, invoiceMonth: string, dueDate: string) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const tenants = await queryNamed(
        `SELECT t.id, b.room_id, r.monthly_rent
         FROM tenants t
         JOIN bookings b ON t.booking_id = b.id
         JOIN rooms r ON b.room_id = r.id
         WHERE t.branch_id = @branchId AND t.status = 'ACTIVE'`,
        { branchId },
        client
      );
      
      let count = 0;
      for (const t of tenants.rows) {
        const check = await queryNamed('SELECT id FROM rent_invoices WHERE tenant_id = @tenantId AND invoice_month = @invoiceMonth', { tenantId: t.id, invoiceMonth }, client);
        if (check.rows.length === 0) {
          await queryNamed(
            `INSERT INTO rent_invoices (branch_id, tenant_id, invoice_month, due_date, rent_amount, total_amount, status)
             VALUES (@branchId, @tenantId, @invoiceMonth, @dueDate, @monthlyRent, @monthlyRent, 'PENDING')`,
            { branchId, tenantId: t.id, invoiceMonth, dueDate, monthlyRent: t.monthly_rent },
            client
          );
          count++;
        }
      }
      await client.query('COMMIT');
      return { generated: count };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async getRentInvoices(branchId: string) {
    // 1. Auto-sync any existing bookings that have a tenant but lack an initial rent invoice
    try {
      const unsyncedBookings = await queryNamed(
        `SELECT b.*, r.monthly_rent, r.security_deposit, t.id as tenant_id
         FROM bookings b
         JOIN rooms r ON b.room_id = r.id
         JOIN tenants t ON (t.booking_id = b.id OR (t.user_id = b.user_id AND t.branch_id = b.branch_id))
         WHERE b.branch_id = @branchId
           AND NOT EXISTS (SELECT 1 FROM rent_invoices ri WHERE ri.tenant_id = t.id)`,
        { branchId }
      );

      for (const bk of unsyncedBookings.rows) {
        const rent = Number(bk.monthly_rent || 0);
        const deposit = Number(bk.security_deposit || 0);
        const total = rent + deposit;
        const isPaid = bk.status === 'PAID';
        await queryNamed(
          `INSERT INTO rent_invoices (branch_id, tenant_id, invoice_month, due_date, rent_amount, maintenance_amount, total_amount, status)
           VALUES (@branchId, @tenantId, 'Initial Rent & Deposit', @dueDate, @rent, @deposit, @total, @status)
           ON CONFLICT DO NOTHING`,
          {
            branchId,
            tenantId: bk.tenant_id,
            dueDate: bk.check_in_date || bk.booking_date || new Date(),
            rent,
            deposit,
            total,
            status: isPaid ? 'PAID' : 'PENDING'
          }
        );
      }
    } catch (err) {
      console.warn('Could not auto-sync booking invoices in getRentInvoices:', err);
    }

    // 2. Fetch all rent invoices for this branch
    const res = await queryNamed(
      `SELECT ri.*, 
              t.tenant_code, 
              u.full_name as tenant_name, 
              u.mobile_number
       FROM rent_invoices ri
       JOIN tenants t ON ri.tenant_id = t.id
       JOIN users u ON t.user_id = u.id
       WHERE ri.branch_id = @branchId 
       ORDER BY ri.created_at DESC`,
      { branchId }
    );

    // 3. Also fetch any standalone/pending bookings that don't have a tenant or invoice row yet
    const standaloneBookings = await queryNamed(
      `SELECT b.*, 
              r.room_number, 
              r.monthly_rent, 
              r.security_deposit, 
              u.full_name as tenant_name, 
              u.mobile_number
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       JOIN users u ON b.user_id = u.id
       WHERE b.branch_id = @branchId 
         AND b.status NOT IN ('CANCELLED', 'REJECTED')
         AND NOT EXISTS (
           SELECT 1 FROM tenants t 
           JOIN rent_invoices ri ON ri.tenant_id = t.id 
           WHERE t.booking_id = b.id OR (t.user_id = b.user_id AND t.branch_id = b.branch_id)
         )
       ORDER BY b.booking_date DESC`,
      { branchId }
    );

    const mappedInvoices = res.rows.map((inv: any) => {
      const total = Number(inv.total_amount || 0);
      const isPaid = inv.status === 'PAID';
      return {
        ...inv,
        invoice_number: `INV-${(inv.id || '').slice(0, 8).toUpperCase()}`,
        billing_month: inv.invoice_month || inv.billing_month || 'Monthly Rent',
        rent_amount: Number(inv.rent_amount || 0),
        maintenance_amount: Number(inv.maintenance_amount || 0),
        total_amount: total,
        paid_amount: isPaid ? total : 0,
        balance_amount: isPaid ? 0 : total,
      };
    });

    const mappedBookings = standaloneBookings.rows.map((bk: any) => {
      const rent = Number(bk.monthly_rent || 0);
      const deposit = Number(bk.security_deposit || 0);
      const total = rent + deposit;
      const isPaid = bk.status === 'PAID';
      return {
        id: bk.id,
        branch_id: bk.branch_id,
        isBooking: true,
        invoice_number: bk.booking_number || `BK-${(bk.id || '').slice(0, 8).toUpperCase()}`,
        tenant_name: bk.tenant_name || 'Resident',
        mobile_number: bk.mobile_number || 'N/A',
        tenant_code: 'TNT-PENDING',
        billing_month: 'Initial Rent & Deposit',
        due_date: bk.check_in_date || bk.booking_date || new Date(),
        rent_amount: rent,
        maintenance_amount: deposit,
        total_amount: total,
        paid_amount: isPaid ? total : 0,
        balance_amount: isPaid ? 0 : total,
        status: isPaid ? 'PAID' : (bk.status === 'PENDING' ? 'PENDING' : bk.status),
        created_at: bk.booking_date,
      };
    });

    return [...mappedInvoices, ...mappedBookings];
  }

  public static async getPayments(branchId: string) {
    const res = await queryNamed(
      `SELECT p.*, u.full_name as user_name
       FROM payments p
       JOIN users u ON p.user_id = u.id
       WHERE p.branch_id = @branchId ORDER BY p.created_at DESC`,
      { branchId }
    );
    return res.rows;
  }

  public static async verifyManualPayment(paymentId: string, status: string, remarks?: string) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const pRes = await queryNamed('SELECT * FROM payments WHERE id = @paymentId FOR UPDATE', { paymentId }, client);
      if (pRes.rows.length === 0) throw new Error('Payment not found');
      const payment = pRes.rows[0];

      const res = await queryNamed(
        `UPDATE payments SET status = @status, remarks = COALESCE(@remarks, remarks) WHERE id = @paymentId RETURNING *`,
        { status, remarks: remarks || null, paymentId },
        client
      );

      if (status === 'SUCCESS') {
        if (payment.invoice_id) {
          await queryNamed("UPDATE rent_invoices SET status = 'PAID' WHERE id = @invoiceId", { invoiceId: payment.invoice_id }, client);
        }
        if (payment.booking_id && payment.invoice_id == null) {
          // Booking payment
          const bRes = await queryNamed('SELECT status FROM bookings WHERE id = @bookingId', { bookingId: payment.booking_id }, client);
          if (bRes.rows.length > 0 && bRes.rows[0].status === 'APPROVED') {
             await this.updateBookingStatus(payment.booking_id, 'PAID');
          }
        }
      }
      await client.query('COMMIT');
      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // COMPLAINTS
  public static async getComplaints(branchId: string) {
    const res = await queryNamed(
      `SELECT c.*, t.tenant_code, u.full_name as tenant_name, su.full_name as resolved_by_name
       FROM complaints c
       JOIN tenants t ON c.tenant_id = t.id
       JOIN users u ON t.user_id = u.id
       LEFT JOIN users su ON c.resolved_by = su.id
       WHERE c.branch_id = @branchId ORDER BY c.created_at DESC`,
      { branchId }
    );
    return res.rows;
  }

  public static async updateComplaintStatus(complaintId: string, status: string, resolvedByUserId?: string) {
    const res = await queryNamed(
      `UPDATE complaints SET status = @status, resolved_by = @resolvedBy WHERE id = @complaintId RETURNING *`,
      { status, resolvedBy: resolvedByUserId || null, complaintId }
    );
    return res.rows[0];
  }

  // EXPENSES
  public static async createExpense(data: any) {
    const res = await queryNamed(
      `INSERT INTO expenses (branch_id, category, amount, expense_date, description, receipt_url)
       VALUES (@branchId, @category, @amount, @expenseDate, @description, @receiptUrl) RETURNING *`,
      {
        branchId: data.branch_id,
        category: data.category,
        amount: data.amount,
        expenseDate: data.expense_date,
        description: data.description || null,
        receiptUrl: data.receipt_url || null,
      }
    );
    return res.rows[0];
  }

  public static async getExpenses(branchId: string) {
    const res = await queryNamed('SELECT * FROM expenses WHERE branch_id = @branchId ORDER BY expense_date DESC', { branchId });
    return res.rows;
  }

  // NOTICES
  public static async createNotice(data: any) {
    const res = await queryNamed(
      `INSERT INTO notices (branch_id, title, message) VALUES (@branchId, @title, @message) RETURNING *`,
      { branchId: data.branch_id, title: data.title, message: data.message }
    );
    return res.rows[0];
  }

  public static async getNotices(branchId: string) {
    const res = await queryNamed('SELECT * FROM notices WHERE branch_id = @branchId ORDER BY created_at DESC', { branchId });
    return res.rows;
  }

  public static async deleteNotice(id: string) {
    await queryNamed('DELETE FROM notices WHERE id = @id', { id });
    return { success: true };
  }

  // STAFF
  public static async createStaff(data: any) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const pass = data.password || 'staff123';
      const password_hash = await hashPassword(pass);
      const userRes = await queryNamed(
        `INSERT INTO users (full_name, email, mobile_number, password_hash)
         VALUES (@name, @email, @mobile, @hash) RETURNING id`,
        { name: data.full_name, email: data.email, mobile: data.mobile_number, hash: password_hash },
        client
      );
      const userId = userRes.rows[0].id;
      const roleRes = await queryNamed("SELECT id FROM roles WHERE name = 'STAFF'", {}, client);
      if (roleRes.rows.length > 0) {
        await queryNamed('INSERT INTO user_roles (user_id, role_id) VALUES (@userId, @roleId)', { userId, roleId: roleRes.rows[0].id }, client);
      }
      await queryNamed('INSERT INTO user_branches (user_id, branch_id) VALUES (@userId, @branchId)', { userId, branchId: data.branch_id }, client);
      await client.query('COMMIT');
      return { id: userId, email: data.email, full_name: data.full_name };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async getStaff(branchId: string) {
    const res = await queryNamed(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active
       FROM users u JOIN user_branches ub ON u.id = ub.user_id
       WHERE ub.branch_id = @branchId ORDER BY u.created_at DESC`,
      { branchId }
    );
    return res.rows;
  }

  // REPORTS
  public static async getBranchReports(branchId: string) {
    const revenue = await queryNamed("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE branch_id = @branchId AND status = 'SUCCESS'", { branchId });
    const expenses = await queryNamed("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE branch_id = @branchId", { branchId });
    return {
      revenue: parseFloat(revenue.rows[0].total),
      expenses: parseFloat(expenses.rows[0].total),
      profit: parseFloat(revenue.rows[0].total) - parseFloat(expenses.rows[0].total),
    };
  }
}
