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

  /**
   * Location-Based 40 KM Radius PG Discovery (Without Google Maps API)
   * Uses Haversine formula directly in PostgreSQL
   */
  public static async getNearbyPGs(options: {
    lat?: number;
    lng?: number;
    radius?: number;
    search?: string;
    gender?: string;
    min_rent?: number;
    max_rent?: number;
    room_type?: string;
    food?: boolean;
    ac?: boolean;
    amenities?: string[];
    sort_by?: string;
  }) {
    const hasCoords = options.lat !== undefined && options.lng !== undefined && !isNaN(options.lat) && !isNaN(options.lng);
    const radius = options.radius && options.radius > 0 ? options.radius : 40; // Default 40 km

    const params: Record<string, any> = {};

    let distanceSelect = 'NULL::numeric as distance_km';
    let distanceHaving = '';

    if (hasCoords) {
      params.lat = options.lat;
      params.lng = options.lng;
      params.radius = radius;

      // Haversine formula in KM: 6371 * acos(...)
      distanceSelect = `
        ROUND((
          6371 * acos(
            least(1.0, greatest(-1.0,
              cos(radians(@lat)) * cos(radians(b.latitude)) *
              cos(radians(b.longitude) - radians(@lng)) +
              sin(radians(@lat)) * sin(radians(b.latitude))
            ))
          )
        )::numeric, 1) AS distance_km
      `;
      distanceHaving = ` AND (
        6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(@lat)) * cos(radians(b.latitude)) *
            cos(radians(b.longitude) - radians(@lng)) +
            sin(radians(@lat)) * sin(radians(b.latitude))
          ))
        )
      ) <= @radius`;
    }

    let whereConditions = ['b.is_active = TRUE'];

    if (options.search && options.search.trim()) {
      params.search = `%${options.search.trim()}%`;
      whereConditions.push(`(
        b.name ILIKE @search OR
        b.city ILIKE @search OR
        b.district ILIKE @search OR
        b.address ILIKE @search OR
        p.name ILIKE @search
      )`);
    }

    if (options.gender && options.gender.trim() && options.gender.toUpperCase() !== 'ALL') {
      params.gender = options.gender.toUpperCase();
      whereConditions.push(`(b.pg_type = @gender OR b.pg_type = 'UNISEX')`);
    }

    if (options.food !== undefined) {
      params.food = options.food;
      whereConditions.push(`b.food_available = @food`);
    }

    if (options.ac !== undefined) {
      params.ac = options.ac;
      whereConditions.push(`b.ac_available = @ac`);
    }

    let havingConditions: string[] = [];
    if (hasCoords) {
      havingConditions.push(`(
        6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(@lat)) * cos(radians(b.latitude)) *
            cos(radians(b.longitude) - radians(@lng)) +
            sin(radians(@lat)) * sin(radians(b.latitude))
          ))
        )
      ) <= @radius`);
    }

    if (options.min_rent) {
      params.min_rent = options.min_rent;
      havingConditions.push(`COALESCE(MIN(r.monthly_rent), b.starting_monthly_rent, 0) >= @min_rent`);
    }

    if (options.max_rent) {
      params.max_rent = options.max_rent;
      havingConditions.push(`COALESCE(MIN(r.monthly_rent), b.starting_monthly_rent, 0) <= @max_rent`);
    }

    if (options.room_type && options.room_type.trim() && options.room_type.toUpperCase() !== 'ALL') {
      params.room_type = options.room_type;
      havingConditions.push(`BOOL_OR(r.room_type ILIKE @room_type) = TRUE`);
    }

    let orderBy = 'distance_km ASC NULLS LAST, b.rating DESC';
    if (options.sort_by === 'price_asc') {
      orderBy = 'min_rent ASC, distance_km ASC NULLS LAST';
    } else if (options.sort_by === 'price_desc') {
      orderBy = 'min_rent DESC, distance_km ASC NULLS LAST';
    } else if (options.sort_by === 'rating') {
      orderBy = 'b.rating DESC, distance_km ASC NULLS LAST';
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        b.id,
        b.property_id,
        b.name,
        b.name as pg_name,
        b.name as branch_name,
        p.name as property_name,
        b.address,
        b.city,
        b.state,
        b.district,
        b.contact_number,
        b.latitude,
        b.longitude,
        COALESCE(b.pg_type, 'UNISEX') as pg_type,
        COALESCE(b.rating, 4.5) as rating,
        COALESCE(b.total_reviews, 18) as total_reviews,
        COALESCE(b.food_available, TRUE) as food_available,
        COALESCE(b.ac_available, FALSE) as ac_available,
        b.description,
        COALESCE(b.cover_image, 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80') as cover_image,
        COALESCE(b.images, '[]'::jsonb) as images,
        COALESCE(b.amenities, '[]'::jsonb) as amenities,
        ${distanceSelect},
        COALESCE(MIN(r.monthly_rent), b.starting_monthly_rent, 0) as min_rent,
        COALESCE(MAX(r.monthly_rent), b.starting_monthly_rent, 0) as max_rent,
        COUNT(DISTINCT r.id) as total_rooms,
        COUNT(DISTINCT bd.id) as total_beds,
        COUNT(DISTINCT CASE WHEN bd.status = 'AVAILABLE' THEN bd.id END) as available_beds,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', r.id,
            'room_number', r.room_number,
            'room_type', r.room_type,
            'monthly_rent', r.monthly_rent,
            'status', r.status,
            'available_beds', (SELECT COUNT(*) FROM beds b_sub WHERE b_sub.room_id = r.id AND b_sub.status = 'AVAILABLE')
          )) FILTER (WHERE r.id IS NOT NULL), '[]'::json
        ) as rooms
      FROM branches b
      JOIN properties p ON b.property_id = p.id
      LEFT JOIN rooms r ON r.branch_id = b.id AND r.status != 'INACTIVE'
      LEFT JOIN beds bd ON bd.room_id = r.id
      ${whereClause}
      GROUP BY b.id, p.id
      ${havingClause}
      ORDER BY ${orderBy}
    `;

    const res = await queryNamed(sql, params);
    return res.rows;
  }

  public static async getPGById(id: string, userLat?: number, userLng?: number) {
    let distanceSelect = 'NULL::numeric as distance_km';
    const params: Record<string, any> = { id };

    if (userLat !== undefined && userLng !== undefined && !isNaN(userLat) && !isNaN(userLng)) {
      params.lat = userLat;
      params.lng = userLng;
      distanceSelect = `
        ROUND((
          6371 * acos(
            least(1.0, greatest(-1.0,
              cos(radians(@lat)) * cos(radians(b.latitude)) *
              cos(radians(b.longitude) - radians(@lng)) +
              sin(radians(@lat)) * sin(radians(b.latitude))
            ))
          )
        )::numeric, 1) AS distance_km
      `;
    }

    const branchRes = await queryNamed(
      `SELECT b.*, p.name as property_name, p.description as property_description,
              u.full_name as owner_name, u.email as owner_email, u.mobile_number as owner_mobile,
              ${distanceSelect}
       FROM branches b
       JOIN properties p ON b.property_id = p.id
       JOIN users u ON p.owner_id = u.id
       WHERE b.id = @id AND b.is_active = TRUE`,
      params
    );

    if (branchRes.rows.length === 0) throw new Error('PG accommodation not found');

    const pg = branchRes.rows[0];

    // Fetch rooms with beds
    const roomsRes = await queryNamed(
      `SELECT r.*,
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
       WHERE r.branch_id = @id AND r.status != 'INACTIVE'
       ORDER BY r.monthly_rent ASC, r.room_number ASC`,
      { id }
    );

    pg.rooms = roomsRes.rows;
    return pg;
  }
}
