import pool from '../db/database';

export class TenantService {
  public static async getTenantDashboard(userId: string) {
    const tenantRes = await pool.query('SELECT * FROM tenants WHERE user_id = $1', [userId]);
    if (tenantRes.rows.length === 0) throw new Error('Tenant profile not found');

    const tenant = tenantRes.rows[0];

    // Fetch registered property & branch details
    let registeredProperty = null;
    if (tenant.branch_id) {
      const propRes = await pool.query(
        `SELECT b.id as branch_id, b.branch_name, b.address as branch_address, b.city as branch_city,
                p.id as property_id, p.property_name, p.property_type, p.description as property_description,
                po.business_name as owner_business_name, po.contact_number as owner_contact, po.email as owner_email
         FROM branches b
         JOIN properties p ON b.property_id = p.id
         JOIN property_owners po ON p.owner_id = po.id
         WHERE b.id = $1`,
        [tenant.branch_id]
      );
      if (propRes.rows.length > 0) {
        registeredProperty = propRes.rows[0];
      }
    }

    // Get stay allocation / room
    const stayRes = await pool.query(
      `SELECT sa.*, r.room_number, r.monthly_rent, b.branch_name, b.address as branch_address, bd.bed_number
       FROM stay_allocations sa
       JOIN rooms r ON sa.room_id = r.id
       JOIN branches b ON sa.branch_id = b.id
       LEFT JOIN beds bd ON sa.bed_id = bd.id
       WHERE sa.tenant_id = $1 AND sa.is_active = TRUE`,
      [tenant.id]
    );

    // Pending invoices
    const invoiceRes = await pool.query(
      `SELECT * FROM rent_invoices WHERE tenant_id = $1 AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE') ORDER BY due_date ASC`,
      [tenant.id]
    );

    // Recent complaints
    const complaintRes = await pool.query(
      `SELECT * FROM complaints WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [tenant.id]
    );

    // Tenant KYC Documents
    const docRes = await pool.query(
      `SELECT * FROM tenant_documents WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenant.id]
    );

    const pendingInvoicesAmount = invoiceRes.rows.reduce((acc: number, inv: any) => acc + Number(inv.balance_amount || 0), 0);

    return {
      tenant,
      registeredProperty,
      currentStay: stayRes.rows[0] || null,
      pendingInvoices: invoiceRes.rows,
      recentComplaints: complaintRes.rows,
      documents: docRes.rows,
      summary: {
        pendingInvoicesAmount,
      },
    };
  }

  public static async createBooking(userId: string, data: {
    branch_id: string;
    room_id: string;
    bed_id?: string;
    expected_check_in_date: string;
    expected_check_out_date?: string;
    remarks?: string;
    advance_payment_amount?: number;
    payment_method?: string;
    occupation?: string;
    company_name?: string;
    permanent_address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    photo?: string;
    emergency_name?: string;
    emergency_phone?: string;
    emergency_relation?: string;
    document_type?: string;
    document_number?: string;
    document_url?: string;
  }) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      // 1. Get User info
      const userRes = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) throw new Error('User account not found');
      const user = userRes.rows[0];

      // 2. Check or Create Tenant Profile
      let tenantRes = await client.query('SELECT id FROM tenants WHERE user_id = $1', [userId]);
      let tenantId: string;

      if (tenantRes.rows.length === 0) {
        const tenantCode = `TNT-${Date.now().toString().slice(-6)}`;
        const newTenant = await client.query(
          `INSERT INTO tenants (user_id, branch_id, tenant_code, full_name, mobile_number, email, occupation, company_name, permanent_address, city, state, pincode, photo, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ACTIVE') RETURNING id`,
          [
            userId,
            data.branch_id,
            tenantCode,
            user.full_name,
            user.mobile_number,
            user.email,
            data.occupation || null,
            data.company_name || null,
            data.permanent_address || null,
            data.city || null,
            data.state || null,
            data.pincode || null,
            data.photo || null,
          ]
        );
        tenantId = newTenant.rows[0].id;
      } else {
        tenantId = tenantRes.rows[0].id;
        // Update profile fields
        await client.query(
          `UPDATE tenants
           SET occupation = COALESCE($1, occupation),
               company_name = COALESCE($2, company_name),
               permanent_address = COALESCE($3, permanent_address),
               city = COALESCE($4, city),
               state = COALESCE($5, state),
               pincode = COALESCE($6, pincode),
               photo = COALESCE($7, photo),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $8`,
          [
            data.occupation || null,
            data.company_name || null,
            data.permanent_address || null,
            data.city || null,
            data.state || null,
            data.pincode || null,
            data.photo || null,
            tenantId,
          ]
        );
      }

      // 3. Add Emergency Contact if provided
      if (data.emergency_name && data.emergency_phone) {
        await client.query(
          `INSERT INTO emergency_contacts (tenant_id, name, relation, phone)
           VALUES ($1, $2, $3, $4)`,
          [tenantId, data.emergency_name, data.emergency_relation || 'Parent/Guardian', data.emergency_phone]
        );
      }

      // 4. Add Tenant Document if provided
      if (data.document_url) {
        await client.query(
          `INSERT INTO tenant_documents (tenant_id, document_type, document_number, document_url)
           VALUES ($1, $2, $3, $4)`,
          [tenantId, data.document_type || 'ID_PROOF', data.document_number || 'N/A', data.document_url]
        );
      }

      // 5. Verify Room & Bed Availability
      const roomRes = await client.query('SELECT * FROM rooms WHERE id = $1 AND is_active = TRUE FOR UPDATE', [data.room_id]);
      if (roomRes.rows.length === 0) throw new Error('Selected room is no longer available');
      const room = roomRes.rows[0];

      if (room.status === 'FULLY_OCCUPIED' || room.status === 'RESERVED' || room.status === 'MAINTENANCE') {
        throw new Error('This room has already been reserved or occupied.');
      }

      // 6. Financial Calculation (Rent + Deposit + Electricity + Maintenance)
      const monthlyRent = parseFloat(room.monthly_rent || 0);
      const securityDeposit = parseFloat(room.security_deposit || 0);
      const electricityCharge = parseFloat(room.electricity_charge || 0);
      const maintenanceCharge = parseFloat(room.maintenance_charge || 0);
      const calculatedTotal = monthlyRent + securityDeposit + electricityCharge + maintenanceCharge;
      const finalBookingAmount = data.advance_payment_amount ? parseFloat(data.advance_payment_amount.toString()) : calculatedTotal;

      const bookingNumber = `BK-${Date.now().toString().slice(-8)}`;
      const remarksText = data.remarks || `Advance payment: ₹${finalBookingAmount} via ${data.payment_method || 'Online'}`;

      // 7. Insert Booking
      const bookingRes = await client.query(
        `INSERT INTO bookings (branch_id, tenant_id, room_id, bed_id, booking_number, expected_check_in_date, expected_check_out_date, booking_amount, security_deposit, monthly_rent, status, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', $11)
         RETURNING *`,
        [
          data.branch_id,
          tenantId,
          data.room_id,
          data.bed_id || null,
          bookingNumber,
          data.expected_check_in_date,
          data.expected_check_out_date || null,
          finalBookingAmount,
          securityDeposit,
          monthlyRent,
          remarksText,
        ]
      );

      // 8. Update Room Status to RESERVED
      await client.query(
        `UPDATE rooms SET status = 'RESERVED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [data.room_id]
      );

      await client.query('COMMIT');

      const resultBooking = bookingRes.rows[0];
      resultBooking.financial_breakdown = {
        monthly_rent: monthlyRent,
        security_deposit: securityDeposit,
        electricity_charge: electricityCharge,
        maintenance_charge: maintenanceCharge,
        total_advance: finalBookingAmount,
        payment_method: data.payment_method || 'Online UPI/Card',
      };

      return resultBooking;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async getTenantBookings(userId: string) {
    const res = await pool.query(
      `SELECT bk.*, b.branch_name, r.room_number, bd.bed_number
       FROM bookings bk
       JOIN tenants t ON bk.tenant_id = t.id
       JOIN branches b ON bk.branch_id = b.id
       JOIN rooms r ON bk.room_id = r.id
       LEFT JOIN beds bd ON bk.bed_id = bd.id
       WHERE t.user_id = $1 ORDER BY bk.created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  public static async createComplaint(userId: string, data: {
    category: string;
    title: string;
    description: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  }) {
    const tenantRes = await pool.query(
      `SELECT t.id as tenant_id, sa.branch_id, sa.room_id
       FROM tenants t
       JOIN stay_allocations sa ON t.id = sa.tenant_id AND sa.is_active = TRUE
       WHERE t.user_id = $1`,
      [userId]
    );

    if (tenantRes.rows.length === 0) {
      throw new Error('Active stay allocation required to raise complaints');
    }

    const { tenant_id, branch_id, room_id } = tenantRes.rows[0];
    const complaintNumber = `CMP-${Date.now().toString().slice(-6)}`;

    const res = await pool.query(
      `INSERT INTO complaints (branch_id, tenant_id, room_id, complaint_number, category, title, description, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN') RETURNING *`,
      [branch_id, tenant_id, room_id, complaintNumber, data.category, data.title, data.description, data.priority || 'MEDIUM']
    );

    return res.rows[0];
  }

  public static async getTenantComplaints(userId: string) {
    const res = await pool.query(
      `SELECT c.*, r.room_number
       FROM complaints c
       JOIN tenants t ON c.tenant_id = t.id
       JOIN rooms r ON c.room_id = r.id
       WHERE t.user_id = $1 ORDER BY c.created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  public static async getTenantInvoices(userId: string) {
    const res = await pool.query(
      `SELECT ri.*, b.branch_name
       FROM rent_invoices ri
       JOIN tenants t ON ri.tenant_id = t.id
       JOIN branches b ON ri.branch_id = b.id
       WHERE t.user_id = $1 ORDER BY ri.due_date DESC`,
      [userId]
    );
    return res.rows;
  }

  public static async getTenantPayments(userId: string) {
    const res = await pool.query(
      `SELECT rp.*, ri.invoice_number
       FROM rent_payments rp
       JOIN tenants t ON rp.tenant_id = t.id
       JOIN rent_invoices ri ON rp.rent_invoice_id = ri.id
       WHERE t.user_id = $1 ORDER BY rp.created_at DESC`,
      [userId]
    );
    return res.rows;
  }
}
