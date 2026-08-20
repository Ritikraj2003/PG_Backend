export interface IFloor {
  id: string;
  branch_id: string;
  floor_number: number;
  floor_name: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
