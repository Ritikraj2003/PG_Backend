import { queryNamed } from '../db/database';

export class TenantService {
  public static async getDashboardData(userId: string) {
    // 1. Try to find active tenant
    const tRes = await queryNamed("SELECT * FROM tenants WHERE user_id = @userId AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1", { userId });
    let tenant = tRes.rows[0] || null;
    let branchId = tenant ? tenant.branch_id : null;
    let bookingId = tenant ? tenant.booking_id : null;

    // 2. If no active tenant, look in active/pending/confirmed bookings only
    if (!branchId) {
      const bRes = await queryNamed(
        `SELECT * FROM bookings 
         WHERE user_id = @userId AND status NOT IN ('CHECKED_OUT', 'CANCELLED', 'REJECTED') 
         ORDER BY booking_date DESC LIMIT 1`,
        { userId }
      );
      if (bRes.rows.length > 0) {
        bookingId = bRes.rows[0].id;
        branchId = bRes.rows[0].branch_id;
      }
    }

    if (!branchId && !bookingId) {
      const payments = await queryNamed('SELECT * FROM payments WHERE user_id = @userId ORDER BY created_at DESC LIMIT 5', { userId });
      const invoices = await queryNamed(
        `SELECT ri.* FROM rent_invoices ri JOIN tenants t ON ri.tenant_id = t.id WHERE t.user_id = @userId ORDER BY ri.created_at DESC LIMIT 5`,
        { userId }
      );
      return { 
        activeTenant: null, 
        booking: null, 
        room: null, 
        branch: null, 
        registeredProperty: null, 
        summary: {},
        recentInvoices: invoices.rows,
        recentPayments: payments.rows,
        notices: []
      };
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
      if (booking) {
        booking.booking_number = booking.booking_number || `BK-${(booking.id || '').slice(0, 8).toUpperCase()}`;
      }
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
    const bookingNumber = `BK-${Math.floor(100000 + Math.random() * 900000)}`;
    const res = await queryNamed(
      `INSERT INTO bookings (
         branch_id, user_id, room_id, bed_id, status, booking_status, booking_number,
         document_url, document_type, document_number, photo_url,
         occupation, company_name, permanent_address, city, state, pincode,
         emergency_name, emergency_phone, emergency_relation,
         expected_check_in_date, advance_payment_amount, payment_method, remarks
       )
       VALUES (
         @branch_id, @user_id, @room_id, @bed_id, 'PENDING', 'PENDING', @booking_number,
         @document_url, @document_type, @document_number, @photo_url,
         @occupation, @company_name, @permanent_address, @city, @state, @pincode,
         @emergency_name, @emergency_phone, @emergency_relation,
         @expected_check_in_date, @advance_payment_amount, @payment_method, @remarks
       ) RETURNING *`,
      {
        branch_id: data.branch_id,
        user_id: data.user_id,
        room_id: data.room_id,
        bed_id: data.bed_id || null,
        booking_number: bookingNumber,
        document_url: data.document_url || null,
        document_type: data.document_type || null,
        document_number: data.document_number || null,
        photo_url: data.photo || data.photo_url || null,
        occupation: data.occupation || null,
        company_name: data.company_name || null,
        permanent_address: data.permanent_address || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        emergency_name: data.emergency_name || null,
        emergency_phone: data.emergency_phone || null,
        emergency_relation: data.emergency_relation || null,
        expected_check_in_date: data.expected_check_in_date || null,
        advance_payment_amount: data.advance_payment_amount || 0,
        payment_method: data.payment_method || null,
        remarks: data.remarks || null,
      }
    );

    const booking = res.rows[0];

    if (booking && data.document_url) {
      try {
        await queryNamed(
          `INSERT INTO documents (entity_type, entity_id, document_type, document_url)
           VALUES ('BOOKING', @entity_id, @document_type, @document_url)`,
          {
            entity_id: booking.id,
            document_type: data.document_type || 'ID_PROOF',
            document_url: data.document_url,
          }
        );
      } catch (docErr) {
        console.warn('Could not insert booking document into documents table:', docErr);
      }
    }

    if (data.bed_id) {
      await queryNamed("UPDATE beds SET status = 'RESERVED' WHERE id = @bed_id", { bed_id: data.bed_id });
    }
    return booking;
  }

  public static async getBookings(userId: string) {
    const res = await queryNamed(
      `SELECT 
         b.*, 
         r.room_number, 
         r.room_type, 
         r.monthly_rent, 
         r.security_deposit, 
         br.name as branch_name, 
         p.name as property_name,
         bd.bed_number,
         pay.status as latest_payment_status
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       JOIN branches br ON b.branch_id = br.id
       LEFT JOIN properties p ON br.property_id = p.id
       LEFT JOIN beds bd ON b.bed_id = bd.id
       LEFT JOIN LATERAL (
         SELECT status FROM payments WHERE booking_id = b.id ORDER BY created_at DESC LIMIT 1
       ) pay ON true
       WHERE b.user_id = @userId 
       ORDER BY b.booking_date DESC`,
      { userId }
    );

    return res.rows.map((b: any) => {
      const isPaid = b.status === 'PAID' || b.status === 'CHECKED_IN' || b.status === 'CHECKED_OUT' || b.latest_payment_status === 'SUCCESS' || b.latest_payment_status === 'COMPLETED';
      const isPendingVerif = !isPaid && b.latest_payment_status === 'PENDING_VERIFICATION';
      
      const payment_status = isPaid 
        ? 'PAID' 
        : (isPendingVerif ? 'PENDING_VERIFICATION' : 'UNPAID');

      return {
        ...b,
        booking_number: b.booking_number || `BK-${(b.id || '').slice(0, 8).toUpperCase()}`,
        payment_status,
        display_status: b.status === 'PAID' ? 'CONFIRMED' : b.status,
      };
    });
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
