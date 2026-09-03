import pool, { queryNamed } from '../db/database';
import { hashPassword } from '../utils/password';

export class OwnerService {
  // DASHBOARD
  public static async getDashboardData(ownerId: string, targetBranchId?: string) {
    const propRes = await queryNamed('SELECT id, name, description FROM properties WHERE owner_id = @ownerId', { ownerId });
    if (propRes.rows.length === 0) return { property: null, branches: [], summary: {} };
    const property = propRes.rows[0];

    const branchesRes = await queryNamed('SELECT * FROM branches WHERE property_id = @propertyId ORDER BY created_at ASC', { propertyId: property.id });
    const allBranchIds = branchesRes.rows.map(b => b.id);

    if (allBranchIds.length === 0) {
      return { property, branches: [], summary: { totalBranches: 0, totalRooms: 0, totalBeds: 0, activeTenants: 0, totalRevenue: 0, pendingRent: 0 } };
    }

    let activeBranchId = targetBranchId;
    if (!activeBranchId || !allBranchIds.includes(activeBranchId)) {
      activeBranchId = allBranchIds[0];
    }
    const activeBranch = branchesRes.rows.find(b => b.id === activeBranchId);

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

  public static async getOwnerBranches(ownerId: string) {
    const res = await queryNamed(
      `SELECT b.* FROM branches b JOIN properties p ON b.property_id = p.id WHERE p.owner_id = @ownerId ORDER BY b.created_at DESC`,
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
      `SELECT t.*, u.full_name as user_name, u.email as user_email, u.mobile_number as user_mobile
       FROM tenants t JOIN users u ON t.user_id = u.id WHERE t.branch_id = @branchId ORDER BY t.created_at DESC`,
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
    const res = await queryNamed(
      `INSERT INTO rent_invoices (branch_id, tenant_id, invoice_month, due_date, rent_amount, total_amount, status)
       VALUES (@branchId, @tenantId, @invoiceMonth, @dueDate, @rentAmount, @totalAmount, 'PENDING') RETURNING *`,
      {
        branchId: data.branch_id,
        tenantId: data.tenant_id,
        invoiceMonth: data.invoice_month,
        dueDate: data.due_date,
        rentAmount: data.rent_amount,
        totalAmount: data.total_amount,
      }
    );
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
    const res = await queryNamed(
      `SELECT ri.*, t.tenant_code, u.full_name as tenant_name, u.mobile_number
       FROM rent_invoices ri
       JOIN tenants t ON ri.tenant_id = t.id
       JOIN users u ON t.user_id = u.id
       WHERE ri.branch_id = @branchId ORDER BY ri.created_at DESC`,
      { branchId }
    );
    return res.rows;
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
