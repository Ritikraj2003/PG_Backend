import { queryNamed } from '../db/database';

export class TenantService {
  public static async getDashboardData(userId: string) {
    const tRes = await queryNamed("SELECT * FROM tenants WHERE user_id = @userId AND status = 'ACTIVE'", { userId });
    if (tRes.rows.length === 0) return { activeTenant: null, summary: {} };

    const tenant = tRes.rows[0];
    const branchRes = await queryNamed('SELECT id, name, address, contact_number FROM branches WHERE id = @branchId', { branchId: tenant.branch_id });
    const roomRes = await queryNamed('SELECT * FROM rooms WHERE id IN (SELECT room_id FROM bookings WHERE id = @bookingId)', { bookingId: tenant.booking_id });

    const invoices = await queryNamed('SELECT * FROM rent_invoices WHERE tenant_id = @tenantId ORDER BY created_at DESC LIMIT 5', { tenantId: tenant.id });
    const payments = await queryNamed('SELECT * FROM payments WHERE user_id = @userId ORDER BY created_at DESC LIMIT 5', { userId });
    const notices = await queryNamed('SELECT * FROM notices WHERE branch_id = @branchId ORDER BY created_at DESC LIMIT 5', { branchId: tenant.branch_id });

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
    const res = await queryNamed(
      `INSERT INTO bookings (branch_id, user_id, room_id, bed_id, status)
       VALUES (@branch_id, @user_id, @room_id, @bed_id, 'PENDING') RETURNING *`,
      {
        branch_id: data.branch_id,
        user_id: data.user_id,
        room_id: data.room_id,
        bed_id: data.bed_id || null,
      }
    );
    if (data.bed_id) {
      await queryNamed("UPDATE beds SET status = 'RESERVED' WHERE id = @bed_id", { bed_id: data.bed_id });
    }
    return res.rows[0];
  }

  public static async getBookings(userId: string) {
    const res = await queryNamed(
      `SELECT b.*, r.room_number, r.room_type, r.monthly_rent, r.security_deposit, br.name as branch_name, bd.bed_number
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       JOIN branches br ON b.branch_id = br.id
       LEFT JOIN beds bd ON b.bed_id = bd.id
       WHERE b.user_id = @userId ORDER BY b.booking_date DESC`,
      { userId }
    );
    return res.rows;
  }

  public static async submitManualPayment(data: any) {
    const res = await queryNamed(
      `INSERT INTO payments (branch_id, user_id, booking_id, invoice_id, amount, payment_method, status, screenshot_url, reference_number)
       VALUES (@branch_id, @user_id, @booking_id, @invoice_id, @amount, 'MANUAL_QR', 'PENDING_VERIFICATION', @screenshot_url, @reference_number) RETURNING *`,
      {
        branch_id: data.branch_id,
        user_id: data.user_id,
        booking_id: data.booking_id || null,
        invoice_id: data.invoice_id || null,
        amount: data.amount,
        screenshot_url: data.screenshot_url,
        reference_number: data.reference_number || null,
      }
    );
    return res.rows[0];
  }

  public static async getBranchSettings(branchId: string) {
    const res = await queryNamed('SELECT upi_id, upi_qr_url, razorpay_key FROM branch_settings WHERE branch_id = @branchId', { branchId });
    return res.rows[0];
  }

  public static async createComplaint(data: any) {
    const res = await queryNamed(
      `INSERT INTO complaints (branch_id, user_id, tenant_id, room_id, title, description, status)
       VALUES (@branch_id, @user_id, @tenant_id, @room_id, @title, @description, 'OPEN') RETURNING *`,
      {
        branch_id: data.branch_id || null,
        user_id: data.user_id,
        tenant_id: data.tenant_id || null,
        room_id: data.room_id || null,
        title: data.title,
        description: data.description,
      }
    );
    return res.rows[0];
  }

  public static async getComplaints(userId: string) {
    const res = await queryNamed('SELECT * FROM complaints WHERE user_id = @userId ORDER BY created_at DESC', { userId });
    return res.rows;
  }

  public static async getInvoices(userId: string) {
    const tRes = await queryNamed('SELECT id FROM tenants WHERE user_id = @userId', { userId });
    let invoices: any[] = [];
    
    if (tRes.rows.length > 0) {
      const tenantIds = tRes.rows.map(t => t.id);
      const res = await queryNamed('SELECT * FROM rent_invoices WHERE tenant_id = ANY(@tenantIds) ORDER BY created_at DESC', { tenantIds });
      invoices = res.rows;
    }

    // Also fetch all booking invoices for the user (pending, approved, confirmed, paid, checked-in)
    const bkRes = await queryNamed(
      `SELECT b.*, r.room_number, r.monthly_rent, r.security_deposit, br.name as branch_name
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       JOIN branches br ON b.branch_id = br.id
       WHERE b.user_id = @userId AND b.status NOT IN ('CANCELLED', 'REJECTED')
       ORDER BY b.booking_date DESC`,
      { userId }
    );

    const bookingInvoices = bkRes.rows.map((bk) => {
      const rent = Number(bk.monthly_rent) || 0;
      const deposit = Number(bk.security_deposit) || 0;
      const total = rent + deposit;
      const isPaid = bk.status === 'PAID' || bk.status === 'CHECKED_IN';
      return {
        id: bk.id,
        isBooking: true,
        branch_id: bk.branch_id,
        invoice_number: bk.booking_number || `BK-${bk.id.slice(0, 6)}`,
        billing_month: 'Initial Rent & Deposit',
        total_amount: total,
        balance_amount: isPaid ? 0 : total,
        status: isPaid ? 'PAID' : 'PENDING',
        created_at: bk.booking_date,
      };
    });

    return [...invoices, ...bookingInvoices];
  }

  public static async getPayments(userId: string) {
    const res = await queryNamed('SELECT * FROM payments WHERE user_id = @userId ORDER BY created_at DESC', { userId });
    return res.rows;
  }
}
