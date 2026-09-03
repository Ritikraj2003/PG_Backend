import { queryNamed } from '../db/database';

export class PublicService {
  public static async getProperties(city?: string, type?: string) {
    let sql = `
      SELECT p.*, po.full_name as owner_business_name,
             (SELECT COUNT(*) FROM branches b WHERE b.property_id = p.id AND b.is_active = TRUE) as total_branches
      FROM properties p
      JOIN users po ON p.owner_id = po.id
      WHERE p.is_active = TRUE
    `;
    const params: Record<string, any> = {};

    if (city) {
      params.city = `%${city}%`;
      sql += ` AND p.city ILIKE @city`;
    }
    if (type) {
      params.type = type;
      sql += ` AND p.property_type = @type`;
    }

    sql += ` ORDER BY p.created_at DESC`;

    const res = await queryNamed(sql, params);
    return res.rows;
  }

  public static async getPropertyById(id: string) {
    const propRes = await queryNamed(
      `SELECT p.*, po.full_name as owner_business_name
       FROM properties p
       JOIN users po ON p.owner_id = po.id
       WHERE p.id = @id AND p.is_active = TRUE`,
      { id }
    );

    if (propRes.rows.length === 0) throw new Error('Property not found');

    const property = propRes.rows[0];

    const branchRes = await queryNamed(
      `SELECT b.* FROM branches b WHERE b.property_id = @id AND b.is_active = TRUE`,
      { id }
    );

    property.branches = branchRes.rows;
    return property;
  }

  public static async getBranchById(id: string) {
    const branchRes = await queryNamed(
      `SELECT b.*, p.property_name, p.property_type
       FROM branches b
       JOIN properties p ON b.property_id = p.id
       WHERE b.id = @id AND b.is_active = TRUE`,
      { id }
    );

    if (branchRes.rows.length === 0) throw new Error('Branch not found');

    const branch = branchRes.rows[0];

    const amenitiesRes = await queryNamed(
      `SELECT a.* FROM amenities a
       JOIN branch_amenities ba ON a.id = ba.amenity_id
       WHERE ba.branch_id = @id`,
      { id }
    );

    const roomsRes = await queryNamed(
      `SELECT r.*, rt.name as room_type_name, f.floor_name
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       LEFT JOIN floors f ON r.floor_id = f.id
       WHERE r.branch_id = @id AND r.is_active = TRUE`,
      { id }
    );

    branch.amenities = amenitiesRes.rows;
    branch.rooms = roomsRes.rows;
    return branch;
  }

  public static async getRooms(branch_id?: string, min_rent?: number, max_rent?: number, status?: string) {
    let sql = `
      SELECT r.*, b.name as branch_name, b.city, p.name as property_name,
             (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.id AND bd.status = 'AVAILABLE') as available_beds,
             (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.id) as total_beds,
             COALESCE(
               (SELECT json_agg(json_build_object(
                 'id', bd.id,
                 'bed_number', bd.bed_number,
                 'status', bd.status
               ) ORDER BY bd.bed_number ASC) FROM beds bd WHERE bd.room_id = r.id), '[]'::json
             ) as beds
      FROM rooms r
      JOIN branches b ON r.branch_id = b.id
      JOIN properties p ON b.property_id = p.id
      WHERE r.status != 'INACTIVE' AND b.is_active = TRUE
    `;
    const params: Record<string, any> = {};

    if (branch_id) {
      params.branch_id = branch_id;
      sql += ` AND r.branch_id = @branch_id`;
    }
    if (min_rent) {
      params.min_rent = min_rent;
      sql += ` AND r.monthly_rent >= @min_rent`;
    }
    if (max_rent) {
      params.max_rent = max_rent;
      sql += ` AND r.monthly_rent <= @max_rent`;
    }
    if (status) {
      params.status = status;
      sql += ` AND r.status = @status`;
    }

    sql += ` ORDER BY r.room_number ASC`;

    const res = await queryNamed(sql, params);
    return res.rows;
  }

  public static async getRoomById(id: string) {
    const roomRes = await queryNamed(
      `SELECT r.*, b.name as branch_name, b.address as branch_address, b.city, p.name as property_name
       FROM rooms r
       JOIN branches b ON r.branch_id = b.id
       JOIN properties p ON b.property_id = p.id
       WHERE r.id = @id AND r.status != 'INACTIVE'`,
      { id }
    );

    if (roomRes.rows.length === 0) throw new Error('Room not found');

    const room = roomRes.rows[0];

    const bedsRes = await queryNamed(
      `SELECT * FROM beds WHERE room_id = @id AND is_active = TRUE ORDER BY bed_number ASC`,
      { id }
    );

    room.beds = bedsRes.rows;
    return room;
  }

  public static async getRoomAvailability(id: string) {
    const roomRes = await queryNamed(
      `SELECT r.id, r.room_number, r.status, r.monthly_rent,
              COUNT(b.id) as total_beds,
              COUNT(CASE WHEN b.status = 'AVAILABLE' THEN 1 END) as available_beds,
              COUNT(CASE WHEN b.status = 'OCCUPIED' THEN 1 END) as occupied_beds
       FROM rooms r
       LEFT JOIN beds b ON r.id = b.room_id AND b.is_active = TRUE
       WHERE r.id = @id
       GROUP BY r.id`,
      { id }
    );

    if (roomRes.rows.length === 0) throw new Error('Room not found');
    return roomRes.rows[0];
  }
}
