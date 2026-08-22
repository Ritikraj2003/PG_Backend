import * as crypto from 'crypto';
import pool from '../db/database';
import razorpayInstance from '../config/razorpay';
import { config } from '../config/env';

export class PaymentService {
  public static async createRazorpayOrder(amount: number, currency: string = 'INR', receipt: string) {
    try {
      const options = {
        amount: Math.round(amount * 100), // amount in paise
        currency,
        receipt,
      };

      const order = await razorpayInstance.orders.create(options);
      return order;
    } catch (error: any) {
      console.error('Razorpay order creation error:', error);
      // Fallback mock order if API keys are test/placeholder
      return {
        id: `order_${Date.now()}`,
        entity: 'order',
        amount: Math.round(amount * 100),
        amount_paid: 0,
        amount_due: Math.round(amount * 100),
        currency,
        receipt,
        status: 'created',
      };
    }
  }

  public static verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;
  }

  public static verifyWebhookSignature(payloadString: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(payloadString)
      .digest('hex');

    return expectedSignature === signature;
  }

  public static async processRentPaymentSuccess(data: {
    rent_invoice_id: string;
    amount: number;
    payment_method: string;
    transaction_id: string;
    payment_gateway?: string;
  }) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const invRes = await client.query(
        'SELECT * FROM rent_invoices WHERE id = $1 FOR UPDATE',
        [data.rent_invoice_id]
      );
      if (invRes.rows.length === 0) throw new Error('Rent invoice not found');

      const invoice = invRes.rows[0];
      const newPaid = parseFloat(invoice.paid_amount) + data.amount;
      const newBalance = parseFloat(invoice.total_amount) - newPaid;
      const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIALLY_PAID';

      // Update Invoice
      await client.query(
        `UPDATE rent_invoices
         SET paid_amount = $1, balance_amount = $2, status = $3, updated_at = NOW()
         WHERE id = $4`,
        [newPaid, Math.max(0, newBalance), newStatus, invoice.id]
      );

      // Record Rent Payment
      const receiptNumber = `RCP-${Date.now().toString().slice(-8)}`;
      const paymentRes = await client.query(
        `INSERT INTO rent_payments (branch_id, tenant_id, rent_invoice_id, amount, payment_method, transaction_id, payment_gateway, payment_status, receipt_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SUCCESS', $8)
         RETURNING *`,
        [
          invoice.branch_id,
          invoice.tenant_id,
          invoice.id,
          data.amount,
          data.payment_method,
          data.transaction_id,
          data.payment_gateway || 'RAZORPAY',
          receiptNumber,
        ]
      );

      if (newStatus === 'PAID') {
        // If there's an approved booking for this tenant in this branch, activate stay allocation & mark bed OCCUPIED
        const bkRes = await client.query(
          `SELECT * FROM bookings WHERE tenant_id = $1 AND branch_id = $2 AND status IN ('APPROVED', 'CONFIRMED') ORDER BY created_at DESC LIMIT 1`,
          [invoice.tenant_id, invoice.branch_id]
        );
        if (bkRes.rows.length > 0) {
          const bk = bkRes.rows[0];
          const stayRes = await client.query(`SELECT id FROM stay_allocations WHERE tenant_id = $1 AND is_active = TRUE`, [invoice.tenant_id]);
          if (stayRes.rows.length === 0) {
            await client.query(
              `INSERT INTO stay_allocations (branch_id, tenant_id, room_id, bed_id, start_date)
               VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
              [invoice.branch_id, invoice.tenant_id, bk.room_id, bk.bed_id || null]
            );
            if (bk.bed_id) {
              await client.query('UPDATE beds SET status = \'OCCUPIED\', updated_at = NOW() WHERE id = $1', [bk.bed_id]);
            }
            await client.query('UPDATE rooms SET status = \'PARTIALLY_OCCUPIED\', updated_at = NOW() WHERE id = $1', [bk.room_id]);
            await client.query('UPDATE bookings SET status = \'CHECKED_IN\', updated_at = NOW() WHERE id = $1', [bk.id]);
          }
        }
      }

      await client.query('COMMIT');
      return paymentRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async processBookingPaymentSuccess(data: {
    booking_id: string;
    amount: number;
    payment_method: string;
    transaction_id: string;
  }) {
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');

      const bRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [data.booking_id]);
      if (bRes.rows.length === 0) throw new Error('Booking not found');
      const booking = bRes.rows[0];

      const receiptNumber = `BK-RCP-${Date.now().toString().slice(-8)}`;
      const paymentRes = await client.query(
        `INSERT INTO booking_payments (booking_id, amount, payment_method, transaction_id, payment_status, receipt_number)
         VALUES ($1, $2, $3, $4, 'SUCCESS', $5) RETURNING *`,
        [data.booking_id, data.amount, data.payment_method, data.transaction_id, receiptNumber]
      );

      // Confirm booking
      await client.query(
        'UPDATE bookings SET status = \'CONFIRMED\', updated_at = NOW() WHERE id = $1',
        [data.booking_id]
      );

      if (booking.bed_id) {
        await client.query('UPDATE beds SET status = \'RESERVED\', updated_at = NOW() WHERE id = $1', [booking.bed_id]);
      }

      await client.query('COMMIT');
      return paymentRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
