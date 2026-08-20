export interface IRoomType {
  id: string;
  name: string;
  description?: string;
  capacity: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
