import pool from '../db/database';

export class TenantService {
  public static async getDashboardData(userId: string) {
    const tRes = await pool.query('SELECT * FROM tenants WHERE user_id = $1 AND status = \'ACTIVE\'', [userId]);
    if (tRes.rows.length === 0) return { activeTenant: null, summary: {} };

    const tenant = tRes.rows[0];
    const branchRes = await pool.query('SELECT id, name, address, contact_number FROM branches WHERE id = $1', [tenant.branch_id]);
    const roomRes = await pool.query('SELECT * FROM rooms WHERE id IN (SELECT room_id FROM bookings WHERE id = $1)', [tenant.booking_id]);

    const invoices = await pool.query('SELECT * FROM rent_invoices WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5', [tenant.id]);
    const payments = await pool.query('SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5', [userId]);
    const notices = await pool.query('SELECT * FROM notices WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 5', [tenant.branch_id]);

    return {
      activeTenant: tenant,
      branch: branchRes.rows[0],
      room: roomRes.rows[0],
      recentInvoices: invoices.rows,
      recentPayments: payments.rows,
      notices: notices.rows
    };
  }

  public static async createBooking(data: any) {
    const res = await pool.query(
      `INSERT INTO bookings (branch_id, user_id, room_id, bed_id, status)
       VALUES ($1, $2, $3, $4, 'PENDING') RETURNING *`,
      [data.branch_id, data.user_id, data.room_id, data.bed_id || null]
    );
    if (data.bed_id) {
      await pool.query('UPDATE beds SET status = \'RESERVED\' WHERE id = $1', [data.bed_id]);
    }
    return res.rows[0];
  }

  public static async getBookings(userId: string) {
    const res = await pool.query(
      `SELECT b.*, r.room_number, r.room_type, r.monthly_rent, r.security_deposit, br.name as branch_name, bd.bed_number
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       JOIN branches br ON b.branch_id = br.id
       LEFT JOIN beds bd ON b.bed_id = bd.id
       WHERE b.user_id = $1 ORDER BY b.booking_date DESC`,
      [userId]
    );
    return res.rows;
  }

  public static async submitManualPayment(data: any) {
    const res = await pool.query(
      `INSERT INTO payments (branch_id, user_id, booking_id, invoice_id, amount, payment_method, status, screenshot_url, reference_number)
       VALUES ($1, $2, $3, $4, $5, 'MANUAL_QR', 'PENDING_VERIFICATION', $6, $7) RETURNING *`,
      [data.branch_id, data.user_id, data.booking_id || null, data.invoice_id || null, data.amount, data.screenshot_url, data.reference_number || null]
    );
    return res.rows[0];
  }

  public static async getBranchSettings(branchId: string) {
    const res = await pool.query('SELECT upi_id, upi_qr_url, razorpay_key FROM branch_settings WHERE branch_id = $1', [branchId]);
    return res.rows[0];
  }

  public static async createComplaint(data: any) {
    const res = await pool.query(
      `INSERT INTO complaints (branch_id, user_id, tenant_id, room_id, title, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN') RETURNING *`,
      [data.branch_id, data.user_id, data.tenant_id, data.room_id, data.title, data.description]
    );
    return res.rows[0];
  }

  public static async getComplaints(userId: string) {
    const res = await pool.query('SELECT * FROM complaints WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows;
  }

  public static async getInvoices(userId: string) {
    const tRes = await pool.query('SELECT id FROM tenants WHERE user_id = $1', [userId]);
    if (tRes.rows.length === 0) return [];
    
    const tenantIds = tRes.rows.map(t => t.id);
    const res = await pool.query('SELECT * FROM rent_invoices WHERE tenant_id = ANY($1) ORDER BY created_at DESC', [tenantIds]);
    return res.rows;
  }

  public static async getPayments(userId: string) {
    const res = await pool.query('SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows;
  }
}
