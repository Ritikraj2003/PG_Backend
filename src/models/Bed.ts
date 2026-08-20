import { BedStatus } from '../types';

export interface IBed {
  id: string;
  branch_id: string;
  room_id: string;
  bed_number: string;
  bed_name?: string;
  monthly_rent: number;
  security_deposit: number;
  status: BedStatus;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
