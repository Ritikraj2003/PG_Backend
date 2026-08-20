import { BookingStatus } from '../types';

export interface IBooking {
  id: string;
  branch_id: string;
  tenant_id: string;
  room_id: string;
  bed_id?: string;
  booking_number: string;
  booking_date: Date;
  expected_check_in_date: Date;
  expected_check_out_date?: Date;
  booking_amount: number;
  security_deposit: number;
  monthly_rent: number;
  status: BookingStatus;
  remarks?: string;
  created_at: Date;
  updated_at: Date;
}
