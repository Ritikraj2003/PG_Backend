import { TenantStatus } from '../types';

export interface ITenant {
  id: string;
  user_id: string;
  branch_id: string;
  tenant_code: string;
  full_name: string;
  father_name?: string;
  mother_name?: string;
  date_of_birth?: Date;
  gender?: string;
  mobile_number: string;
  email: string;
  occupation?: string;
  company_name?: string;
  permanent_address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  photo?: string;
  status: TenantStatus;
  created_at: Date;
  updated_at: Date;
}
