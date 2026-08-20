import pool from '../db/database';
import { NotificationService } from './notificationService';

export class CronService {
  public static async runRentReminders() {
    console.log('[CRON] Running rent reminders...');
    // Find invoices due in 3 days that are PENDING or PARTIALLY_PAID
    const res = await pool.query(
      `SELECT ri.*, t.user_id, t.full_name
       FROM rent_invoices ri
       JOIN tenants t ON ri.tenant_id = t.id
       WHERE ri.status IN ('PENDING', 'PARTIALLY_PAID')
         AND ri.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'`
    );

    let count = 0;
    for (const inv of res.rows) {
      // Check if notification already sent today (idempotence)
      const existing = await pool.query(
        `SELECT id FROM notifications
         WHERE user_id = $1 AND title LIKE 'Rent Reminder%' AND created_at >= CURRENT_DATE`,
        [inv.user_id]
      );

      if (existing.rows.length === 0) {
        await NotificationService.sendPushNotification(
          inv.user_id,
          `Rent Reminder: Invoice ${inv.invoice_number}`,
          `Dear ${inv.full_name}, your rent invoice for ${inv.billing_month} of amount ₹${inv.balance_amount} is due on ${inv.due_date}.`,
          'RENT_DUE'
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

      // Update invoices past due date to OVERDUE
      const res = await client.query(
        `UPDATE rent_invoices
         SET status = 'OVERDUE', updated_at = NOW()
         WHERE status IN ('PENDING', 'PARTIALLY_PAID')
           AND due_date < CURRENT_DATE
         RETURNING id, tenant_id, invoice_number, balance_amount`
      );

      for (const inv of res.rows) {
        const tRes = await client.query('SELECT user_id, full_name FROM tenants WHERE id = $1', [inv.tenant_id]);
        if (tRes.rows.length > 0) {
          const tenant = tRes.rows[0];
          // Idempotent check
          const existing = await client.query(
            `SELECT id FROM notifications WHERE user_id = $1 AND title LIKE 'Overdue Rent Notice%' AND created_at >= CURRENT_DATE`,
            [tenant.user_id]
          );

          if (existing.rows.length === 0) {
            await NotificationService.sendPushNotification(
              tenant.user_id,
              `Overdue Rent Notice: ${inv.invoice_number}`,
              `Attention ${tenant.full_name}, your rent payment of ₹${inv.balance_amount} is overdue. Please pay immediately.`,
              'RENT_OVERDUE'
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
    console.log('[CRON] Running check-in reminders...');
    const res = await pool.query(
      `SELECT bk.*, t.user_id, t.full_name
       FROM bookings bk
       JOIN tenants t ON bk.tenant_id = t.id
       WHERE bk.status = 'CONFIRMED'
         AND bk.expected_check_in_date = CURRENT_DATE + INTERVAL '1 day'`
    );

    let count = 0;
    for (const bk of res.rows) {
      const existing = await pool.query(
        `SELECT id FROM notifications WHERE user_id = $1 AND title LIKE 'Check-In Tomorrow%' AND created_at >= CURRENT_DATE`,
        [bk.user_id]
      );

      if (existing.rows.length === 0) {
        await NotificationService.sendPushNotification(
          bk.user_id,
          `Check-In Tomorrow! Booking: ${bk.booking_number}`,
          `Hi ${bk.full_name}, your check-in is scheduled for tomorrow (${bk.expected_check_in_date}). Welcome!`,
          'CHECK_IN'
        );
        count++;
      }
    }
    return { remindersSent: count };
  }

  public static async runCheckOutReminders() {
    console.log('[CRON] Running check-out reminders...');
    const res = await pool.query(
      `SELECT sa.*, t.user_id, t.full_name
       FROM stay_allocations sa
       JOIN tenants t ON sa.tenant_id = t.id
       WHERE sa.is_active = TRUE
         AND sa.end_date = CURRENT_DATE + INTERVAL '2 days'`
    );

    let count = 0;
    for (const sa of res.rows) {
      const existing = await pool.query(
        `SELECT id FROM notifications WHERE user_id = $1 AND title LIKE 'Upcoming Check-Out%' AND created_at >= CURRENT_DATE`,
        [sa.user_id]
      );

      if (existing.rows.length === 0) {
        await NotificationService.sendPushNotification(
          sa.user_id,
          `Upcoming Check-Out Notice`,
          `Hi ${sa.full_name}, your stay end date is near. Please coordinate check-out procedures with management.`,
          'CHECK_OUT'
        );
        count++;
      }
    }
    return { remindersSent: count };
  }
}
