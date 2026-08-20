import pool from '../db/database';
import { hashPassword } from '../utils/password';

export class OwnerService {
  public static async getDashboardData(ownerId: string) {
    const propRes = await pool.query('SELECT id, property_name FROM properties WHERE owner_id = $1', [ownerId]);
    if (propRes.rows.length === 0) return { property: null, branches: [], summary: {} };

    const property = propRes.rows[0];

    const branchesRes = await pool.query('SELECT * FROM branches WHERE property_id = $1', [property.id]);
    const branchIds = branchesRes.rows.map(b => b.id);

    if (branchIds.length === 0) {
      return { property, branches: [], summary: { totalBranches: 0, totalRooms: 0, totalBeds: 0, activeTenants: 0, monthlyRevenue: 0 } };
    }

    const roomsRes = await pool.query(
      'SELECT COUNT(*) as count FROM rooms WHERE branch_id = ANY($1)',
      [branchIds]
    );
    const bedsRes = await pool.query(
      'SELECT COUNT(*) as count, COUNT(CASE WHEN status=\'OCCUPIED\' THEN 1 END) as occupied FROM beds WHERE branch_id = ANY($1)',
      [branchIds]
    );
    const tenantsRes = await pool.query(
      'SELECT COUNT(*) as count FROM tenants WHERE branch_id = ANY($1) AND status = \'ACTIVE\'',
      [branchIds]
    );
    const revenueRes = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM rent_payments WHERE branch_id = ANY($1) AND payment_status = \'SUCCESS\'',
      [branchIds]
    );
    const pendingRentRes = await pool.query(
      'SELECT COALESCE(SUM(balance_amount), 0) as total FROM rent_invoices WHERE branch_id = ANY($1) AND status IN (\'PENDING\', \'PARTIALLY_PAID\', \'OVERDUE\')',
      [branchIds]
    );

    return {
      property,
      branches: branchesRes.rows,
      summary: {
        totalBranches: branchIds.length,
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
      `SELECT b.* FROM branches b
       JOIN properties p ON b.property_id = p.id
       WHERE p.owner_id = $1 ORDER BY b.created_at DESC`,
      [ownerId]
    );
    return res.rows;
  }

  // Floors
  public static async createFloor(branchId: string, floor_number: number, floor_name: string, description?: string) {
    const res = await pool.query(
      `INSERT INTO floors (branch_id, floor_number, floor_name, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [branchId, floor_number, floor_name, description || null]
    );
    return res.rows[0];
  }

  public static async getFloors(branchId: string) {
    if (!branchId) return [];
    let res = await pool.query('SELECT * FROM floors WHERE branch_id = $1 ORDER BY floor_number ASC', [branchId]);
    
    // Auto-create default floors if branch has 0 floors
    if (res.rows.length === 0) {
      const defaultFloors = [
        { num: 0, name: 'Ground Floor' },
        { num: 1, name: '1st Floor' },
        { num: 2, name: '2nd Floor' },
        { num: 3, name: '3rd Floor' },
      ];
      for (const df of defaultFloors) {
        await pool.query(
          `INSERT INTO floors (branch_id, floor_number, floor_name) VALUES ($1, $2, $3)`,
          [branchId, df.num, df.name]
        );
      }
      res = await pool.query('SELECT * FROM floors WHERE branch_id = $1 ORDER BY floor_number ASC', [branchId]);
    }

    return res.rows;
  }

  public static async updateFloor(id: string, floor_number?: number, floor_name?: string, description?: string) {
    const res = await pool.query(
      `UPDATE floors SET
        floor_number = COALESCE($1, floor_number),
        floor_name = COALESCE($2, floor_name),
        description = COALESCE($3, description),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [floor_number ?? null, floor_name || null, description || null, id]
    );
    if (res.rows.length === 0) {
      throw new Error('Floor not found');
    }
    return res.rows[0];
  }

  public static async deleteFloor(id: string) {
    const res = await pool.query('DELETE FROM floors WHERE id = $1 RETURNING *', [id]);
    if (res.rows.length === 0) {
      throw new Error('Floor not found');
    }
    return { success: true, message: 'Floor deleted successfully' };
  }

  // Room Types
  public static async createRoomType(name: string, capacity: number, description?: string) {
    const res = await pool.query(
      `INSERT INTO room_types (name, capacity, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, capacity, description || null]
    );
    return res.rows[0];
  }

  public static async getRoomTypes() {
    const res = await pool.query('SELECT * FROM room_types ORDER BY name ASC');
    return res.rows;
  }

  // Rooms
  public static async createRoom(data: {
    branch_id: string;
    floor_id?: string;
    room_type_id?: string;
    room_number: string;
    room_name?: string;
    monthly_rent: number;
    security_deposit: number;
    electricity_charge?: number;
    maintenance_charge?: number;
    description?: string;
    images?: string[];
    capacity?: number;
  }) {
    const imagesJson = JSON.stringify(data.images || []);
    const res = await pool.query(
      `INSERT INTO rooms (branch_id, floor_id, room_type_id, room_number, room_name, monthly_rent, security_deposit, electricity_charge, maintenance_charge, description, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       RETURNING *`,
      [
        data.branch_id,
        data.floor_id || null,
        data.room_type_id || null,
        data.room_number,
        data.room_name || null,
        data.monthly_rent || 0,
        data.security_deposit || 0,
        data.electricity_charge || 0,
        data.maintenance_charge || 0,
        data.description || null,
        imagesJson,
      ]
    );

    const room = res.rows[0];

    // Auto-create beds if capacity is provided (default 1 if not specified)
    const bedCount = data.capacity && data.capacity > 0 ? data.capacity : 1;
    for (let i = 1; i <= bedCount; i++) {
      const bedNumber = `Bed ${i}`;
      await pool.query(
        `INSERT INTO beds (branch_id, room_id, bed_number, bed_name, monthly_rent, security_deposit, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'AVAILABLE')
         ON CONFLICT (room_id, bed_number) DO NOTHING`,
        [data.branch_id, room.id, bedNumber, `${data.room_number} - Bed ${i}`, data.monthly_rent, data.security_deposit]
      );
    }

    return room;
  }

  public static async getRooms(branchId: string) {
    const res = await pool.query(
      `SELECT r.*, f.floor_name, rt.name as room_type_name,
              (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.id) as total_beds,
              (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.id AND bd.status = 'AVAILABLE') as available_beds,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', bd.id,
                  'bed_number', bd.bed_number,
                  'bed_name', bd.bed_name,
                  'monthly_rent', bd.monthly_rent,
                  'security_deposit', bd.security_deposit,
                  'status', bd.status
                ) ORDER BY bd.bed_number ASC) FROM beds bd WHERE bd.room_id = r.id), '[]'::json
              ) as beds
       FROM rooms r
       LEFT JOIN floors f ON r.floor_id = f.id
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.branch_id = $1 ORDER BY r.room_number ASC`,
      [branchId]
    );
    return res.rows;
  }

  // Beds
  public static async createBed(data: {
    branch_id: string;
    room_id: string;
    bed_number: string;
    bed_name?: string;
    monthly_rent: number;
    security_deposit: number;
  }) {
    const res = await pool.query(
      `INSERT INTO beds (branch_id, room_id, bed_number, bed_name, monthly_rent, security_deposit)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.branch_id, data.room_id, data.bed_number, data.bed_name || null, data.monthly_rent, data.security_deposit]
    );
    return res.rows[0];
  }

  public static async getBeds(roomId: string) {
    const res = await pool.query('SELECT * FROM beds WHERE room_id = $1 ORDER BY bed_number ASC', [roomId]);
    return res.rows;
  }

  public static async updateBed(id: string, data: {
    bed_number?: string;
    bed_name?: string;
    monthly_rent?: number;
    security_deposit?: number;
    status?: string;
  }) {
    const res = await pool.query(
      `UPDATE beds
       SET bed_number = COALESCE($1, bed_number),
           bed_name = COALESCE($2, bed_name),
           monthly_rent = COALESCE($3, monthly_rent),
           security_deposit = COALESCE($4, security_deposit),
           status = COALESCE($5, status)
       WHERE id = $6 RETURNING *`,
      [data.bed_number || null, data.bed_name || null, data.monthly_rent || null, data.security_deposit || null, data.status || null, id]
    );
    return res.rows[0];
  }

  public static async deleteBed(id: string) {
    const res = await pool.query('DELETE FROM beds WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
  }

  // Tenants
  public static async getTenants(branchId: string) {
    const res = await pool.query(
      `SELECT t.*, u.full_name as user_name
       FROM tenants t
       JOIN users u ON t.user_id = u.id
       WHERE t.branch_id = $1 ORDER BY t.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  // Bookings
  public static async getBookings(branchId: string) {
    const res = await pool.query(
      `SELECT b.*, 
              t.tenant_code,
              t.full_name as tenant_name, 
              t.mobile_number, 
              t.email as tenant_email,
              t.occupation,
              t.company_name,
              t.permanent_address,
              t.city as tenant_city,
              t.state as tenant_state,
              t.pincode as tenant_pincode,
              t.photo as tenant_photo,
              r.room_number, 
              r.room_name,
              r.monthly_rent as room_rent,
              r.security_deposit as room_deposit,
              bd.bed_number,
              COALESCE((SELECT json_agg(ec) FROM emergency_contacts ec WHERE ec.tenant_id = t.id), '[]'::json) as emergency_contacts,
              COALESCE((SELECT json_agg(td) FROM tenant_documents td WHERE td.tenant_id = t.id), '[]'::json) as tenant_documents
       FROM bookings b
       JOIN tenants t ON b.tenant_id = t.id
       JOIN rooms r ON b.room_id = r.id
       LEFT JOIN beds bd ON b.bed_id = bd.id
       WHERE b.branch_id = $1 ORDER BY b.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  public static async updateBookingStatus(bookingId: string, status: string, remarks?: string) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const bRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
      if (bRes.rows.length === 0) throw new Error('Booking not found');
      const booking = bRes.rows[0];

      if (status === 'CONFIRMED' && booking.status !== 'CONFIRMED') {
        // Reserve bed safely
        if (booking.bed_id) {
          await client.query('UPDATE beds SET status = \'RESERVED\' WHERE id = $1', [booking.bed_id]);
        }
        await client.query('UPDATE rooms SET status = \'RESERVED\' WHERE id = $1', [booking.room_id]);

        // Auto generate rent invoice if not present
        const invCheck = await client.query('SELECT COUNT(*) FROM rent_invoices WHERE tenant_id = $1 AND branch_id = $2', [booking.tenant_id, booking.branch_id]);
        if (parseInt(invCheck.rows[0].count) === 0) {
          const invNum = `INV-${Math.floor(10000000 + Math.random() * 90000000)}`;
          const billingMonth = new Date().toISOString().slice(0, 7);
          const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
          const rentAmt = parseFloat(booking.monthly_rent || 0);

          await client.query(
            `INSERT INTO rent_invoices (branch_id, tenant_id, invoice_number, billing_month, due_date, rent_amount, maintenance_amount, electricity_amount, total_amount, paid_amount, balance_amount, status)
             VALUES ($1, $2, $3, $4, $5, $6, 500.00, 300.00, $6 + 800.00, 0.00, $6 + 800.00, 'PENDING')`,
            [booking.branch_id, booking.tenant_id, invNum, billingMonth, dueDate, rentAmt]
          );
        }
      } else if (status === 'CHECKED_OUT' || status === 'VACATED' || status === 'CANCELLED') {
        // Free room & bed so it becomes AVAILABLE again for new tenants
        if (booking.bed_id) {
          await client.query('UPDATE beds SET status = \'AVAILABLE\', updated_at = NOW() WHERE id = $1', [booking.bed_id]);
        }
        await client.query('UPDATE rooms SET status = \'AVAILABLE\', updated_at = NOW() WHERE id = $1', [booking.room_id]);

        // Mark active stay allocation ended
        await client.query('UPDATE stay_allocations SET is_active = FALSE, end_date = CURRENT_DATE WHERE tenant_id = $1', [booking.tenant_id]);

        // Update tenant status
        await client.query('UPDATE tenants SET status = \'CHECKED_OUT\', updated_at = NOW() WHERE id = $1', [booking.tenant_id]);
      }

      const res = await client.query(
        `UPDATE bookings SET status = $1, remarks = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
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

  // Check-In / Check-Out
  public static async processCheckIn(data: {
    branch_id: string;
    tenant_id: string;
    room_id: string;
    bed_id?: string;
    start_date: string;
    id_verified: boolean;
    key_handed: boolean;
    remarks?: string;
  }) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      // Create Stay Allocation
      const saRes = await client.query(
        `INSERT INTO stay_allocations (branch_id, tenant_id, room_id, bed_id, start_date)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [data.branch_id, data.tenant_id, data.room_id, data.bed_id || null, data.start_date]
      );
      const stayAllocationId = saRes.rows[0].id;

      // Check In record
      await client.query(
        `INSERT INTO check_ins (branch_id, tenant_id, stay_allocation_id, id_verified, key_handed, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.branch_id, data.tenant_id, stayAllocationId, data.id_verified, data.key_handed, data.remarks || null]
      );

      // Update tenant status to ACTIVE
      await client.query('UPDATE tenants SET status = \'ACTIVE\', updated_at = NOW() WHERE id = $1', [data.tenant_id]);

      // Update bed & room status to OCCUPIED
      if (data.bed_id) {
        await client.query('UPDATE beds SET status = \'OCCUPIED\', updated_at = NOW() WHERE id = $1', [data.bed_id]);
      }
      await client.query('UPDATE rooms SET status = \'PARTIALLY_OCCUPIED\', updated_at = NOW() WHERE id = $1', [data.room_id]);

      await client.query('COMMIT');
      return { stayAllocationId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async processCheckOut(data: {
    branch_id: string;
    tenant_id: string;
    stay_allocation_id: string;
    refund_amount: number;
    penalty_amount: number;
    remarks?: string;
  }) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const saRes = await client.query('SELECT * FROM stay_allocations WHERE id = $1', [data.stay_allocation_id]);
      if (saRes.rows.length === 0) throw new Error('Stay allocation not found');
      const sa = saRes.rows[0];

      // Mark stay allocation inactive
      await client.query('UPDATE stay_allocations SET is_active = FALSE, end_date = CURRENT_DATE WHERE id = $1', [sa.id]);

      // Insert Check Out record
      await client.query(
        `INSERT INTO check_outs (branch_id, tenant_id, stay_allocation_id, refund_amount, penalty_amount, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.branch_id, data.tenant_id, sa.id, data.refund_amount, data.penalty_amount, data.remarks || null]
      );

      // Update tenant status
      await client.query('UPDATE tenants SET status = \'CHECKED_OUT\', updated_at = NOW() WHERE id = $1', [data.tenant_id]);

      // Free bed & room
      if (sa.bed_id) {
        await client.query('UPDATE beds SET status = \'AVAILABLE\', updated_at = NOW() WHERE id = $1', [sa.bed_id]);
      }

      await client.query('COMMIT');
      return { message: 'Check-out completed successfully' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Rent Invoices & Payments
  public static async createRentInvoice(data: {
    branch_id: string;
    tenant_id: string;
    stay_allocation_id?: string;
    invoice_number?: string;
    billing_month: string;
    due_date: string;
    rent_amount: number;
    maintenance_amount?: number;
    electricity_amount?: number;
    water_amount?: number;
    food_amount?: number;
    other_amount?: number;
    discount?: number;
  }) {
    const invNum = data.invoice_number || `INV-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const maintenance = data.maintenance_amount || 0;
    const electricity = data.electricity_amount || 0;
    const water = data.water_amount || 0;
    const food = data.food_amount || 0;
    const other = data.other_amount || 0;
    const discount = data.discount || 0;
    const total = data.rent_amount + maintenance + electricity + water + food + other - discount;

    const res = await pool.query(
      `INSERT INTO rent_invoices (branch_id, tenant_id, stay_allocation_id, invoice_number, billing_month, due_date, rent_amount, maintenance_amount, electricity_amount, water_amount, food_amount, other_amount, discount, total_amount, paid_amount, balance_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, $14, 'PENDING')
       RETURNING *`,
      [
        data.branch_id,
        data.tenant_id,
        data.stay_allocation_id || null,
        invNum,
        data.billing_month,
        data.due_date,
        data.rent_amount,
        maintenance,
        electricity,
        water,
        food,
        other,
        discount,
        total,
      ]
    );
    return res.rows[0];
  }



  public static async getRentInvoices(branchId: string) {
    const res = await pool.query(
      `SELECT ri.*, t.full_name as tenant_name, t.mobile_number
       FROM rent_invoices ri
       JOIN tenants t ON ri.tenant_id = t.id
       WHERE ri.branch_id = $1 ORDER BY ri.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  public static async getRentPayments(branchId: string) {
    const res = await pool.query(
      `SELECT rp.*, t.full_name as tenant_name, ri.invoice_number
       FROM rent_payments rp
       JOIN tenants t ON rp.tenant_id = t.id
       JOIN rent_invoices ri ON rp.rent_invoice_id = ri.id
       WHERE rp.branch_id = $1 ORDER BY rp.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  // Complaints & Maintenance
  public static async getComplaints(branchId: string) {
    const res = await pool.query(
      `SELECT c.*, t.full_name as tenant_name, r.room_number
       FROM complaints c
       JOIN tenants t ON c.tenant_id = t.id
       JOIN rooms r ON c.room_id = r.id
       WHERE c.branch_id = $1 ORDER BY c.created_at DESC`,
      [branchId]
    );
    return res.rows;
  }

  public static async updateComplaintStatus(complaintId: string, status: string, resolution_note?: string) {
    const res = await pool.query(
      `UPDATE complaints
       SET status = $1, resolution_note = $2, resolved_at = CASE WHEN $1 IN ('RESOLVED', 'CLOSED') THEN NOW() ELSE NULL END
       WHERE id = $3 RETURNING *`,
      [status, resolution_note || null, complaintId]
    );
    return res.rows[0];
  }

  // Expenses
  public static async createExpenseCategory(branch_id: string, category_name: string, description?: string) {
    const res = await pool.query(
      `INSERT INTO expense_categories (branch_id, category_name, description) VALUES ($1, $2, $3) RETURNING *`,
      [branch_id, category_name, description || null]
    );
    return res.rows[0];
  }

  public static async createExpense(data: {
    branch_id: string;
    category_id?: string;
    title: string;
    amount: number;
    expense_date: string;
    paid_to?: string;
    receipt_url?: string;
    payment_method?: string;
    remarks?: string;
  }) {
    const res = await pool.query(
      `INSERT INTO expenses (branch_id, category_id, title, amount, expense_date, paid_to, receipt_url, payment_method, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        data.branch_id,
        data.category_id || null,
        data.title,
        data.amount,
        data.expense_date,
        data.paid_to || null,
        data.receipt_url || null,
        data.payment_method || 'CASH',
        data.remarks || null,
      ]
    );
    return res.rows[0];
  }

  public static async getExpenses(branchId: string) {
    const res = await pool.query(
      `SELECT e.*, ec.category_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.branch_id = $1 ORDER BY e.expense_date DESC`,
      [branchId]
    );
    return res.rows;
  }

  // Staff
  public static async createStaff(data: {
    branch_id: string;
    full_name: string;
    role_name: string;
    mobile_number: string;
    email?: string;
    salary?: number;
    staff_code: string;
    password?: string;
  }) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const pass = data.password || 'password123';
      const password_hash = await hashPassword(pass);

      // Create user
      const userRes = await client.query(
        `INSERT INTO users (full_name, email, mobile_number, password_hash)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [data.full_name, data.email || `${data.staff_code}@staff.local`, data.mobile_number, password_hash]
      );
      const userId = userRes.rows[0].id;

      const roleRes = await client.query('SELECT id FROM roles WHERE name = \'STAFF\'');
      if (roleRes.rows.length > 0) {
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleRes.rows[0].id]);
      }

      const staffRes = await client.query(
        `INSERT INTO staff (branch_id, user_id, staff_code, full_name, role_name, mobile_number, email, salary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [data.branch_id, userId, data.staff_code, data.full_name, data.role_name, data.mobile_number, data.email || null, data.salary || 0]
      );

      await client.query('COMMIT');
      return staffRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async getStaff(branchId: string) {
    const res = await pool.query('SELECT * FROM staff WHERE branch_id = $1 ORDER BY created_at DESC', [branchId]);
    return res.rows;
  }

  // Reports
  public static async getBranchReports(branchId: string) {
    const rooms = await pool.query('SELECT COUNT(*) FROM rooms WHERE branch_id = $1', [branchId]);
    const beds = await pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN status=\'OCCUPIED\' THEN 1 END) as occupied FROM beds WHERE branch_id = $1', [branchId]);
    const tenants = await pool.query('SELECT COUNT(*) FROM tenants WHERE branch_id = $1 AND status = \'ACTIVE\'', [branchId]);
    const revenue = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM rent_payments WHERE branch_id = $1 AND payment_status = \'SUCCESS\'', [branchId]);
    const expenses = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE branch_id = $1', [branchId]);
    const pendingRent = await pool.query('SELECT COALESCE(SUM(balance_amount), 0) as total FROM rent_invoices WHERE branch_id = $1 AND status IN (\'PENDING\', \'PARTIALLY_PAID\', \'OVERDUE\')', [branchId]);

    const totalRev = parseFloat(revenue.rows[0].total);
    const totalExp = parseFloat(expenses.rows[0].total);

    return {
      totalRooms: parseInt(rooms.rows[0].count),
      totalBeds: parseInt(beds.rows[0].total),
      occupiedBeds: parseInt(beds.rows[0].occupied),
      activeTenants: parseInt(tenants.rows[0].count),
      revenue: totalRev,
      expenses: totalExp,
      profit: totalRev - totalExp,
      pendingRent: parseFloat(pendingRent.rows[0].total),
    };
  }
}
