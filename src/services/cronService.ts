import pool, { queryNamed } from '../db/database';
import { NotificationService } from './notificationService';

export class CronService {
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
