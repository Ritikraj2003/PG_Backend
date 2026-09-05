export type RoleType = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'STAFF' | 'USER' | string;

export type PropertyType = 'PG' | 'RENTAL_HOUSE';

export type RoomStatus = 'AVAILABLE' | 'PARTIALLY_OCCUPIED' | 'FULLY_OCCUPIED' | 'MAINTENANCE' | 'INACTIVE';

export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'INACTIVE';

export type BookingStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'CHECKED_OUT' | 'CANCELLED';

export type TenantStatus = 'ACTIVE' | 'CHECKED_OUT';

export type RentStatus = 'PENDING' | 'PAID' | 'OVERDUE';

export type PaymentStatus = 'PENDING_VERIFICATION' | 'SUCCESS' | 'FAILED';

export type PaymentMethod = 'RAZORPAY' | 'MANUAL_QR' | 'CASH';

export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface JwtPayload {
  userId: string;
  email: string;
  roles: RoleType[];
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  mobileNumber: string;
  roles: RoleType[];
  ownerId?: string;
  tenantId?: string;
  branchId?: string;
  permissions?: string[];
  isOwner?: boolean;
}

