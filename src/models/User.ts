export interface IUser {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  password_hash: string;
  is_active: boolean;
  is_email_verified: boolean;
  is_mobile_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export const formatUser = (row: any): Partial<IUser> => ({
  id: row.id,
  full_name: row.full_name,
  email: row.email,
  mobile_number: row.mobile_number,
  is_active: row.is_active,
  is_email_verified: row.is_email_verified,
  is_mobile_verified: row.is_mobile_verified,
  created_at: row.created_at,
  updated_at: row.updated_at
});
