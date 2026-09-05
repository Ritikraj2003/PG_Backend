import { queryNamed } from '../db/database';

export class TenantService {
  public static async getDashboardData(userId: string) {
    // 1. Try to find active tenant
    const tRes = await queryNamed("SELECT * FROM tenants WHERE user_id = @userId AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1", { userId });
    let tenant = tRes.rows[0] || null;
    let branchId = tenant ? tenant.branch_id : null;
    let bookingId = tenant ? tenant.booking_id : null;

    // 2. If no tenant row or no branchId, look in bookings
    if (!branchId) {
      const bRes = await queryNamed(
        `SELECT * FROM bookings WHERE user_id = @userId ORDER BY booking_date DESC LIMIT 1`,
        { userId }
      );
      if (bRes.rows.length > 0) {
        bookingId = bRes.rows[0].id;
        branchId = bRes.rows[0].branch_id;
      }
    }

    if (!branchId && !bookingId) {
      return { activeTenant: null, registeredProperty: null, summary: {} };
    }

    // Get Booking Details
    let booking: any = null;
    if (bookingId) {
      const bkRes = await queryNamed(
        `SELECT b.*, bd.bed_number, r.room_number, r.room_type, r.floor_number, r.monthly_rent, r.security_deposit
         FROM bookings b
         LEFT JOIN rooms r ON b.room_id = r.id
         LEFT JOIN beds bd ON b.bed_id = bd.id
         WHERE b.id = @bookingId`,
        { bookingId }
      );
      booking = bkRes.rows[0] || null;
      if (booking && !branchId) branchId = booking.branch_id;
    }

    // Get Branch & Property Details with Owner info
    let registeredProperty: any = null;
    let branch: any = null;
    if (branchId) {
      const bpRes = await queryNamed(
        `SELECT br.*, 
                br.name as branch_name, 
                br.address as branch_address, 
                br.city as branch_city, 
                br.state as branch_state,
                br.contact_number as branch_contact,
                p.id as property_id,
                p.name as property_name,
                p.description as property_description,
                u.full_name as owner_name,
                u.email as owner_email,
                u.mobile_number as owner_contact
         FROM branches br
         JOIN properties p ON br.property_id = p.id
         JOIN users u ON p.owner_id = u.id
         WHERE br.id = @branchId`,
        { branchId }
      );
      if (bpRes.rows.length > 0) {
        const row = bpRes.rows[0];
        branch = row;
        registeredProperty = {
          property_id: row.property_id,
          property_name: row.property_name,
          property_description: row.property_description,
          branch_id: row.id,
          branch_name: row.branch_name,
          branch_address: row.branch_address,
          branch_city: row.branch_city,
          branch_state: row.branch_state,
          branch_contact: row.branch_contact || row.owner_contact,
          owner_name: row.owner_name,
          owner_email: row.owner_email,
          owner_contact: row.owner_contact,
          amenities: (row.amenities && Array.isArray(row.amenities) && row.amenities.length > 0)
            ? row.amenities
            : [
                'High-Speed Wi-Fi',
                '24/7 Power Backup',
                'RO Purified Drinking Water',
                'Daily Housekeeping',
                'Hot Water Geyser',
                'CCTV Surveillance & Security',
                'Washing Machine & Laundry Area',
                'Spacious Wardrobes & Study Desk'
              ],
          rules: [
            'Visitors allowed only in common areas during designated visiting hours (9 AM - 8 PM).',
            'Quiet hours observed between 10:30 PM and 6:30 AM.',
            'Smoking and alcohol consumption inside rooms is strictly prohibited.',
            'Maintain cleanliness and hygiene in rooms, washrooms, and dining area.'
          ]
        };
      }
    }

    const room = booking ? {
      room_number: booking.room_number,
      room_type: booking.room_type,
      floor_number: booking.floor_number || 1,
      bed_number: booking.bed_number || 'Bed 1',
      monthly_rent: booking.monthly_rent,
      security_deposit: booking.security_deposit,
    } : null;

    const invoices = tenant ? await queryNamed('SELECT * FROM rent_invoices WHERE tenant_id = @tenantId ORDER BY created_at DESC LIMIT 5', { tenantId: tenant.id }) : { rows: [] };
    const payments = await queryNamed('SELECT * FROM payments WHERE user_id = @userId ORDER BY created_at DESC LIMIT 5', { userId });
    const notices = branchId ? await queryNamed('SELECT * FROM notices WHERE branch_id = @branchId ORDER BY created_at DESC LIMIT 5', { branchId }) : { rows: [] };

    return {
      activeTenant: tenant,
      booking,
      room,
      branch,
      registeredProperty,
      recentInvoices: invoices.rows,
      recentPayments: payments.rows,
      notices: notices.rows,
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
    const tRes = await queryNamed('SELECT id, booking_id FROM tenants WHERE user_id = @userId', { userId });
    let invoices: any[] = [];
    
    if (tRes.rows.length > 0) {
      const tenantIds = tRes.rows.map(t => t.id);
      const res = await queryNamed(
        `SELECT ri.*, t.tenant_code
         FROM rent_invoices ri
         JOIN tenants t ON ri.tenant_id = t.id
         WHERE ri.tenant_id = ANY(@tenantIds) 
         ORDER BY ri.created_at DESC`,
        { tenantIds }
      );
      invoices = res.rows.map((inv: any) => {
        const total = Number(inv.total_amount || 0);
        const isPaid = inv.status === 'PAID';
        return {
          ...inv,
          invoice_number: `INV-${(inv.id || '').slice(0, 8).toUpperCase()}`,
          billing_month: inv.invoice_month || inv.billing_month || 'Monthly Rent',
          total_amount: total,
          balance_amount: isPaid ? 0 : total,
          paid_amount: isPaid ? total : 0,
        };
      });
    }

    const hasInitialInvoice = invoices.some((inv: any) => 
      (inv.billing_month && inv.billing_month.includes('Initial')) ||
      (inv.invoice_month && inv.invoice_month.includes('Initial'))
    );

    // Also fetch booking invoices if not already present in rent_invoices
    if (!hasInitialInvoice) {
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
          invoice_number: `INV-BK-${bk.id.slice(0, 6).toUpperCase()}`,
          billing_month: 'Initial Rent & Deposit',
          total_amount: total,
          balance_amount: isPaid ? 0 : total,
          paid_amount: isPaid ? total : 0,
          status: isPaid ? 'PAID' : 'PENDING',
          created_at: bk.booking_date,
        };
      });

      invoices.push(...bookingInvoices);
    }

    return invoices;
  }

  public static async getPayments(userId: string) {
    const res = await queryNamed('SELECT * FROM payments WHERE user_id = @userId ORDER BY created_at DESC', { userId });
    return res.rows;
  }
}
