export type RoleType = 'SUPER_ADMIN' | 'OWNER' | 'STAFF' | 'TENANT';

export type PropertyType = 'PG' | 'RENTAL_HOUSE';

export type RoomStatus = 'AVAILABLE' | 'PARTIALLY_OCCUPIED' | 'FULLY_OCCUPIED' | 'RESERVED' | 'MAINTENANCE' | 'INACTIVE';

export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE' | 'INACTIVE';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';

export type TenantStatus = 'ACTIVE' | 'INACTIVE' | 'CHECKED_OUT' | 'BLOCKED';

export type RentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REJECTED';

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
}
