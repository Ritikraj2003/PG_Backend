import { PropertyType } from '../types';

export interface IProperty {
  id: string;
  owner_id: string;
  property_name: string;
  property_type: PropertyType;
  description?: string;
  logo?: string;
  email?: string;
  phone?: string;
  address: string;
  city: string;
  state: string;
  country: string;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
