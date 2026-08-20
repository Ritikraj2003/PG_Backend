import { RoomStatus } from '../types';

export interface IRoom {
  id: string;
  branch_id: string;
  floor_id: string;
  room_type_id?: string;
  room_number: string;
  room_name?: string;
  monthly_rent: number;
  security_deposit: number;
  electricity_charge?: number;
  maintenance_charge?: number;
  description?: string;
  status: RoomStatus;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
