import { PaymentStatus } from '../types';

export interface IRentPayment {
  id: string;
  branch_id: string;
  tenant_id: string;
  rent_invoice_id: string;
  amount: number;
  payment_method: string;
  transaction_id?: string;
  payment_gateway?: string;
  payment_date: Date;
  payment_status: PaymentStatus;
  receipt_number: string;
  remarks?: string;
  created_at: Date;
}
