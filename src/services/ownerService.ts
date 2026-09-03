import pool from '../db/database';
import { hashPassword } from '../utils/password';

export class OwnerService {
  // DASHBOARD
  public static async getDashboardData(ownerId: string, targetBranchId?: string) {
    const propRes = await pool.query('SELECT id, name, description FROM properties WHERE owner_id = $1', [ownerId]);
    if (propRes.rows.length === 0) return { property: null, branches: [], summary: {} };
    const property = propRes.rows[0];

    const branchesRes = await pool.query('SELECT * FROM branches WHERE property_id = $1 ORDER BY created_at ASC', [property.id]);
    const allBranchIds = branchesRes.rows.map(b => b.id);

    if (allBranchIds.length === 0) {
      return { property, branches: [], summary: { totalBranches: 0, totalRooms: 0, totalBeds: 0, activeTenants: 0, totalRevenue: 0, pendingRent: 0 } };
    }

    let activeBranchId = targetBranchId;
    if (!activeBranchId || !allBranchIds.includes(activeBranchId)) {
      activeBranchId = allBranchIds[0];
    }
    const activeBranch = branchesRes.rows.find(b => b.id === activeBranchId);

    const roomsRes = await pool.query('SELECT COUNT(*) as count FROM rooms WHERE branch_id = $1', [activeBranchId]);
    const bedsRes = await pool.query('SELECT COUNT(*) as count, COUNT(CASE WHEN status=\'OCCUPIED\' THEN 1 END) as occupied FROM beds WHERE room_id IN (SELECT id FROM rooms WHERE branch_id = $1)', [activeBranchId]);
    const tenantsRes = await pool.query('SELECT COUNT(*) as count FROM tenants WHERE branch_id = $1 AND status = \'ACTIVE\'', [activeBranchId]);
    const revenueRes = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE branch_id = $1 AND status = \'SUCCESS\'', [activeBranchId]);
    const pendingRentRes = await pool.query('SELECT COALESCE(SUM(total_amount), 0) as total FROM rent_invoices WHERE branch_id = $1 AND status != \'PAID\'', [activeBranchId]); 

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
    const res = await pool.query(
      `SELECT b.* FROM branches b JOIN properties p ON b.property_id = p.id WHERE p.owner_id = $1 ORDER BY b.created_at DESC`,
      [ownerId]
    );
    return res.rows;
  }

  // BRANCH SETTINGS
  public static async getBranchSettings(branchId: string) {
    const res = await pool.query('SELECT * FROM branch_settings WHERE branch_id = $1', [branchId]);
    return res.rows[0] || null;
  }

  public static async updateBranchSettings(branchId: string, data: any) {
    const res = await pool.query(
      `INSERT INTO branch_settings (branch_id, razorpay_key, razorpay_secret, upi_id, upi_qr_url, smtp_email, smtp_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (branch_id) DO UPDATE SET
         razorpay_key = EXCLUDED.razorpay_key,
         razorpay_secret = EXCLUDED.razorpay_secret,
         upi_id = EXCLUDED.upi_id,
         upi_qr_url = COALESCE(EXCLUDED.upi_qr_url, branch_settings.upi_qr_url),
         smtp_email = EXCLUDED.smtp_email,
         smtp_password = EXCLUDED.smtp_password,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [branchId, data.razorpay_key, data.razorpay_secret, data.upi_id, data.upi_qr_url, data.smtp_email, data.smtp_password]
    );
    return res.rows[0];
  }

  // ROOMS & BEDS
  public static async createRoom(data: any) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [data.branch_id, data.floor_number || 1, data.room_number, data.room_type, data.monthly_rent || 0, data.security_deposit || 0]
      );
      const room = res.rows[0];
      const bedCount = data.capacity ? parseInt(data.capacity) : 1;
      for (let i = 1; i <= bedCount; i++) {
        await client.query(
          `INSERT INTO beds (room_id, bed_number, status) VALUES ($1, $2, 'AVAILABLE') ON CONFLICT DO NOTHING`,
          [room.id, `${data.room_number}-B${i}`]
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
    const res = await pool.query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.id) as total_beds,
        (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.id AND bd.status = 'AVAILABLE') as available_beds,
        COALESCE((SELECT json_agg(bd) FROM beds bd WHERE bd.room_id = r.id), '[]'::json) as beds
       FROM rooms r WHERE r.branch_id = $1 ORDER BY r.floor_number ASC, r.room_number ASC`,
      [branchId]
    );
    return res.rows;
  }

  public static async createBed(data: any) {
    const res = await pool.query(
      `INSERT INTO beds (room_id, bed_number) VALUES ($1, $2) RETURNING *`,
      [data.room_id, data.bed_number]
    );
    return res.rows[0];
  }

  public static async getBeds(roomId: string) {
    const res = await pool.query('SELECT * FROM beds WHERE room_id = $1 ORDER BY bed_number ASC', [roomId]);
    return res.rows;
  }

  public static async updateBed(id: string, data: any) {
    const res = await pool.query(
      `UPDATE beds SET bed_number = COALESCE($1, bed_number), status = COALESCE($2, status) WHERE id = $3 RETURNING *`,
      [data.bed_number, data.status, id]
    );
    return res.rows[0];
  }

  public static async deleteBed(id: string) {
    const res = await pool.query('DELETE FROM beds WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
  }

  // TENANTS & BOOKINGS
  public static async getTenants(branchId: string) {
    const res = await pool.query(
      `SELECT t.*, u.full_name as user_name, u.email as user_email, u.mobile_number as user_mobile
       FROM tenants t JOIN users u ON t.user_id = u.id WHERE t.branch_id = $1 ORDER BY t.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  public static async getBookings(branchId: string) {
    const res = await pool.query(
      `SELECT b.*, u.full_name, u.email, u.mobile_number, r.room_number, r.room_type, r.monthly_rent, r.security_deposit, bd.bed_number
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN rooms r ON b.room_id = r.id
       LEFT JOIN beds bd ON b.bed_id = bd.id
       WHERE b.branch_id = $1 ORDER BY b.booking_date DESC`,
      [branchId]
    );
    return res.rows;
  }

  public static async updateBookingStatus(bookingId: string, status: string, remarks?: string, refundAmount?: number) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const bRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
      if (bRes.rows.length === 0) throw new Error('Booking not found');
      const booking = bRes.rows[0];

      if (status === 'APPROVED' && booking.status === 'PENDING') {
        // Just status update
      } else if (status === 'PAID' && booking.status === 'APPROVED') {
        // Tenant is active now
        if (booking.bed_id) await client.query('UPDATE beds SET status = \'OCCUPIED\' WHERE id = $1', [booking.bed_id]);
        
        await client.query(
          `INSERT INTO tenants (user_id, branch_id, booking_id, tenant_code, status)
           VALUES ($1, $2, $3, $4, 'ACTIVE') ON CONFLICT DO NOTHING`,
          [booking.user_id, booking.branch_id, booking.id, `TNT-${Math.floor(1000 + Math.random() * 9000)}`]
        );
      } else if (status === 'CHECKED_OUT') {
        if (booking.bed_id) await client.query('UPDATE beds SET status = \'AVAILABLE\' WHERE id = $1', [booking.bed_id]);
        await client.query('UPDATE tenants SET status = \'CHECKED_OUT\' WHERE booking_id = $1', [booking.id]);
        await client.query('UPDATE bookings SET actual_check_out_date = CURRENT_DATE, refund_amount = COALESCE($1, 0) WHERE id = $2', [refundAmount, booking.id]);
      } else if (status === 'CANCELLED' || status === 'REJECTED') {
        if (booking.bed_id) await client.query('UPDATE beds SET status = \'AVAILABLE\' WHERE id = $1', [booking.bed_id]);
      }

      const res = await client.query(
        `UPDATE bookings SET status = $1, checkout_remarks = COALESCE($2, checkout_remarks), updated_at = NOW() WHERE id = $3 RETURNING *`,
        [status, remarks || null, bookingId]
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
    const res = await pool.query(
      `INSERT INTO rent_invoices (branch_id, tenant_id, invoice_month, due_date, rent_amount, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING') RETURNING *`,
      [data.branch_id, data.tenant_id, data.invoice_month, data.due_date, data.rent_amount, data.total_amount]
    );
    return res.rows[0];
  }

  public static async generateBulkInvoices(branchId: string, invoiceMonth: string, dueDate: string) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const tenants = await client.query(
        `SELECT t.id, b.room_id, r.monthly_rent
         FROM tenants t
         JOIN bookings b ON t.booking_id = b.id
         JOIN rooms r ON b.room_id = r.id
         WHERE t.branch_id = $1 AND t.status = 'ACTIVE'`, [branchId]
      );
      
      let count = 0;
      for (const t of tenants.rows) {
        const check = await client.query('SELECT id FROM rent_invoices WHERE tenant_id = $1 AND invoice_month = $2', [t.id, invoiceMonth]);
        if (check.rows.length === 0) {
          await client.query(
            `INSERT INTO rent_invoices (branch_id, tenant_id, invoice_month, due_date, rent_amount, total_amount, status)
             VALUES ($1, $2, $3, $4, $5, $5, 'PENDING')`,
            [branchId, t.id, invoiceMonth, dueDate, t.monthly_rent]
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
    const res = await pool.query(
      `SELECT ri.*, t.tenant_code, u.full_name as tenant_name, u.mobile_number
       FROM rent_invoices ri
       JOIN tenants t ON ri.tenant_id = t.id
       JOIN users u ON t.user_id = u.id
       WHERE ri.branch_id = $1 ORDER BY ri.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  public static async getPayments(branchId: string) {
    const res = await pool.query(
      `SELECT p.*, u.full_name as user_name
       FROM payments p
       JOIN users u ON p.user_id = u.id
       WHERE p.branch_id = $1 ORDER BY p.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  public static async verifyManualPayment(paymentId: string, status: string, remarks?: string) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const pRes = await client.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
      if (pRes.rows.length === 0) throw new Error('Payment not found');
      const payment = pRes.rows[0];

      const res = await client.query(
        `UPDATE payments SET status = $1, remarks = COALESCE($2, remarks) WHERE id = $3 RETURNING *`,
        [status, remarks || null, paymentId]
      );

      if (status === 'SUCCESS') {
        if (payment.invoice_id) {
          await client.query('UPDATE rent_invoices SET status = \'PAID\' WHERE id = $1', [payment.invoice_id]);
        }
        if (payment.booking_id && payment.invoice_id == null) {
          // Booking payment
          const bRes = await client.query('SELECT status FROM bookings WHERE id = $1', [payment.booking_id]);
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
    const res = await pool.query(
      `SELECT c.*, t.tenant_code, u.full_name as tenant_name, su.full_name as resolved_by_name
       FROM complaints c
       JOIN tenants t ON c.tenant_id = t.id
       JOIN users u ON t.user_id = u.id
       LEFT JOIN users su ON c.resolved_by = su.id
       WHERE c.branch_id = $1 ORDER BY c.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  public static async updateComplaintStatus(complaintId: string, status: string, resolvedByUserId?: string) {
    const res = await pool.query(
      `UPDATE complaints SET status = $1, resolved_by = $2 WHERE id = $3 RETURNING *`,
      [status, resolvedByUserId || null, complaintId]
    );
    return res.rows[0];
  }

  // EXPENSES
  public static async createExpense(data: any) {
    const res = await pool.query(
      `INSERT INTO expenses (branch_id, category, amount, expense_date, description, receipt_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.branch_id, data.category, data.amount, data.expense_date, data.description || null, data.receipt_url || null]
    );
    return res.rows[0];
  }

  public static async getExpenses(branchId: string) {
    const res = await pool.query('SELECT * FROM expenses WHERE branch_id = $1 ORDER BY expense_date DESC', [branchId]);
    return res.rows;
  }

  // NOTICES
  public static async createNotice(data: any) {
    const res = await pool.query(
      `INSERT INTO notices (branch_id, title, message) VALUES ($1, $2, $3) RETURNING *`,
      [data.branch_id, data.title, data.message]
    );
    return res.rows[0];
  }

  public static async getNotices(branchId: string) {
    const res = await pool.query('SELECT * FROM notices WHERE branch_id = $1 ORDER BY created_at DESC', [branchId]);
    return res.rows;
  }

  public static async deleteNotice(id: string) {
    await pool.query('DELETE FROM notices WHERE id = $1', [id]);
    return { success: true };
  }

  // STAFF
  public static async createStaff(data: any) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      const pass = data.password || 'staff123';
      const password_hash = await hashPassword(pass);
      const userRes = await client.query(
        `INSERT INTO users (full_name, email, mobile_number, password_hash)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [data.full_name, data.email, data.mobile_number, password_hash]
      );
      const userId = userRes.rows[0].id;
      const roleRes = await client.query('SELECT id FROM roles WHERE name = \'STAFF\'');
      if (roleRes.rows.length > 0) {
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleRes.rows[0].id]);
      }
      await client.query('INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)', [userId, data.branch_id]);
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
    const res = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active
       FROM users u JOIN user_branches ub ON u.id = ub.user_id
       WHERE ub.branch_id = $1 ORDER BY u.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  // REPORTS
  public static async getBranchReports(branchId: string) {
    const revenue = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE branch_id = $1 AND status = \'SUCCESS\'', [branchId]);
    const expenses = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE branch_id = $1', [branchId]);
    return {
      revenue: parseFloat(revenue.rows[0].total),
      expenses: parseFloat(expenses.rows[0].total),
      profit: parseFloat(revenue.rows[0].total) - parseFloat(expenses.rows[0].total),
    };
  }
}
