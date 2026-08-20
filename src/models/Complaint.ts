import { ComplaintPriority, ComplaintStatus } from '../types';

export interface IComplaint {
  id: string;
  branch_id: string;
  tenant_id: string;
  room_id: string;
  complaint_number: string;
  category: string;
  title: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assigned_to?: string;
  created_at: Date;
  resolved_at?: Date;
  resolution_note?: string;
}
