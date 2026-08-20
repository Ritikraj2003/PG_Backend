import { RentStatus } from '../types';

export interface IRentInvoice {
  id: string;
  branch_id: string;
  tenant_id: string;
  stay_allocation_id?: string;
  invoice_number: string;
  billing_month: string;
  due_date: Date;
  rent_amount: number;
  maintenance_amount: number;
  electricity_amount: number;
  water_amount: number;
  food_amount: number;
  other_amount: number;
  late_fee: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: RentStatus;
  created_at: Date;
  updated_at: Date;
}
