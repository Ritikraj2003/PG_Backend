import pool, { queryNamed } from '../db/database';
import { NotificationService } from './notificationService';

export class CronService {
  public static async generateMonthlyInvoices() {
    console.log('[CRON] Auto-generating monthly invoices for active tenants...');
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g. '2026-09'
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days

    const activeTenants = await queryNamed(
      `SELECT t.id, t.branch_id, r.monthly_rent, u.id as user_id, u.full_name
       FROM tenants t
       JOIN bookings b ON t.booking_id = b.id
       JOIN rooms r ON b.room_id = r.id
       JOIN users u ON t.user_id = u.id
       WHERE t.status = 'ACTIVE'`,
      {}
    );

    let created = 0;
    for (const t of activeTenants.rows) {
      const check = await queryNamed(
        `SELECT id FROM rent_invoices WHERE tenant_id = @tenantId AND invoice_month = @month`,
        { tenantId: t.id, month: currentMonth }
      );

      if (check.rows.length === 0) {
        const rent = Number(t.monthly_rent || 0);
        await queryNamed(
          `INSERT INTO rent_invoices (branch_id, tenant_id, invoice_month, due_date, rent_amount, total_amount, status)
           VALUES (@branchId, @tenantId, @month, @dueDate, @rent, @rent, 'PENDING')`,
          {
            branchId: t.branch_id,
            tenantId: t.id,
            month: currentMonth,
            dueDate,
            rent,
          }
        );
        created++;

        await NotificationService.sendPushNotification(
          t.user_id,
          `New Rent Bill Generated: ${currentMonth}`,
          `Dear ${t.full_name}, your monthly rent invoice for ${currentMonth} of ₹${rent} has been generated. Due date: ${dueDate.toLocaleDateString()}.`,
          'SYSTEM'
        ).catch(() => {});
      }
    }
    return { created };
  }

  public static async runRentReminders() {
    console.log('[CRON] Running rent reminders...');
    const res = await queryNamed(
      `SELECT ri.*, t.user_id, u.full_name
       FROM rent_invoices ri
       JOIN tenants t ON ri.tenant_id = t.id
       JOIN users u ON t.user_id = u.id
       WHERE ri.status = 'PENDING'
         AND ri.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'`,
      {}
    );

    let count = 0;
    for (const inv of res.rows) {
      const existing = await queryNamed(
        `SELECT id FROM notifications WHERE user_id = @userId AND title LIKE 'Rent Reminder%' AND created_at >= CURRENT_DATE`,
        { userId: inv.user_id }
      );

      if (existing.rows.length === 0) {
        await NotificationService.sendPushNotification(
          inv.user_id,
          `Rent Reminder: ${inv.invoice_month}`,
          `Dear ${inv.full_name}, your rent invoice for ${inv.invoice_month} of amount ₹${inv.total_amount} is due on ${inv.due_date}.`,
          'SYSTEM'
        );
        count++;
      }
    }
    return { processed: count };
  }

  public static async runOverdueRentCheck() {
    console.log('[CRON] Checking overdue rent...');
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `UPDATE rent_invoices SET status = 'OVERDUE', updated_at = NOW()
         WHERE status = 'PENDING' AND due_date < CURRENT_DATE
         RETURNING id, tenant_id, total_amount`
      );

      for (const inv of res.rows) {
        const tRes = await queryNamed(
          'SELECT t.user_id, u.full_name FROM tenants t JOIN users u ON t.user_id = u.id WHERE t.id = @tenantId',
          { tenantId: inv.tenant_id },
          client
        );
        if (tRes.rows.length > 0) {
          const tenant = tRes.rows[0];
          const existing = await queryNamed(
            `SELECT id FROM notifications WHERE user_id = @userId AND title LIKE 'Overdue Rent Notice%' AND created_at >= CURRENT_DATE`,
            { userId: tenant.user_id },
            client
          );

          if (existing.rows.length === 0) {
            await NotificationService.sendPushNotification(
              tenant.user_id,
              `Overdue Rent Notice`,
              `Attention ${tenant.full_name}, your rent payment of ₹${inv.total_amount} is overdue. Please pay immediately.`,
              'SYSTEM'
            );
          }
        }
      }
      await client.query('COMMIT');
      return { overdueCount: res.rowCount };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async runCheckInReminders() {
    // Deprecated for now
    return { remindersSent: 0 };
  }

  public static async runCheckOutReminders() {
    // Deprecated for now
    return { remindersSent: 0 };
  }
}
