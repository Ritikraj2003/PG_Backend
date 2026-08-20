export interface IBranch {
  id: string;
  property_id: string;
  branch_code: string;
  branch_name: string;
  address: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  contact_number: string;
  email?: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
