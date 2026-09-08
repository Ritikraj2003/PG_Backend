-- Migration: 005_location_and_pg_discovery.sql
-- Add Geolocation, 40 KM Search Support, and PG Discovery Attributes

ALTER TABLE branches ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS district VARCHAR(100);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS pg_type VARCHAR(50) DEFAULT 'UNISEX'; -- MALE, FEMALE, UNISEX, COED
ALTER TABLE branches ADD COLUMN IF NOT EXISTS starting_monthly_rent NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS rating NUMERIC(3, 2) DEFAULT 4.5;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS total_reviews INT DEFAULT 18;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS food_available BOOLEAN DEFAULT TRUE;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS ac_available BOOLEAN DEFAULT FALSE;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS description TEXT;

-- Index on coordinates for fast geospatial / radius filtering
CREATE INDEX IF NOT EXISTS idx_branches_lat_lng ON branches(latitude, longitude);

-- Update existing branches with default coordinates (Bengaluru Center if null)
UPDATE branches 
SET 
  latitude = COALESCE(latitude, 12.9352),
  longitude = COALESCE(longitude, 77.6245),
  district = COALESCE(district, 'Bengaluru Urban'),
  pg_type = COALESCE(pg_type, 'UNISEX'),
  starting_monthly_rent = COALESCE(starting_monthly_rent, 8500.00),
  rating = COALESCE(rating, 4.7),
  total_reviews = COALESCE(total_reviews, 34),
  food_available = COALESCE(food_available, TRUE),
  ac_available = COALESCE(ac_available, TRUE),
  cover_image = COALESCE(cover_image, 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80'),
  images = COALESCE(images, '[
    "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80"
  ]'::jsonb)
WHERE latitude IS NULL OR longitude IS NULL;

-- Ensure sample PGs within and outside 40km of Bengaluru Center (12.9716, 77.5946) exist for realistic discovery
DO $$
DECLARE
  v_owner_id UUID;
  v_prop_id UUID;
  v_b1 UUID;
  v_b2 UUID;
  v_b3 UUID;
  v_b4 UUID;
  v_b5 UUID;
  v_b_out UUID;
  v_r1 UUID;
  v_r2 UUID;
BEGIN
  -- Get first owner or admin
  SELECT id INTO v_owner_id FROM users ORDER BY created_at ASC LIMIT 1;
  IF v_owner_id IS NOT NULL THEN
    -- Check if sample discovery property exists
    SELECT id INTO v_prop_id FROM properties WHERE name = 'StayPulse Elite Co-Living' LIMIT 1;
    IF v_prop_id IS NULL THEN
      INSERT INTO properties (owner_id, name, description)
      VALUES (v_owner_id, 'StayPulse Elite Co-Living', 'Premium tech-enabled co-living network across prime tech corridors')
      RETURNING id INTO v_prop_id;
    END IF;

    -- 1. Koramangala PG (~3.5 km from Center)
    IF NOT EXISTS (SELECT 1 FROM branches WHERE name = 'Royal Palm Residency PG') THEN
      INSERT INTO branches (
        property_id, name, address, city, state, district, contact_number,
        latitude, longitude, pg_type, starting_monthly_rent, rating, total_reviews,
        food_available, ac_available, cover_image, images, amenities, description
      ) VALUES (
        v_prop_id, 'Royal Palm Residency PG', '80ft Road, 4th Block, Koramangala', 'Bengaluru', 'Karnataka', 'Bengaluru Urban', '9876543211',
        12.9352, 77.6245, 'UNISEX', 9500.00, 4.8, 62,
        TRUE, TRUE, 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80',
        '["https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80"]'::jsonb,
        '["WiFi", "Food", "AC", "Laundry", "Gym", "Power Backup"]'::jsonb,
        'Luxury co-living space located in the heart of Koramangala with 3-times homestyle meals, high speed WiFi, and daily housekeeping.'
      ) RETURNING id INTO v_b1;

      INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
      VALUES (v_b1, 1, 'K-101', 'Single', 14000.00, 20000.00, 'AVAILABLE') RETURNING id INTO v_r1;
      INSERT INTO beds (room_id, bed_number, status) VALUES (v_r1, 'K-101-A', 'AVAILABLE');

      INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
      VALUES (v_b1, 1, 'K-102', 'Double', 9500.00, 15000.00, 'AVAILABLE') RETURNING id INTO v_r2;
      INSERT INTO beds (room_id, bed_number, status) VALUES (v_r2, 'K-102-A', 'AVAILABLE'), (v_r2, 'K-102-B', 'AVAILABLE');
    END IF;

    -- 2. Indiranagar PG (~5.5 km from Center) - Female PG
    IF NOT EXISTS (SELECT 1 FROM branches WHERE name = 'Serene Haven Luxury PG for Women') THEN
      INSERT INTO branches (
        property_id, name, address, city, state, district, contact_number,
        latitude, longitude, pg_type, starting_monthly_rent, rating, total_reviews,
        food_available, ac_available, cover_image, images, amenities, description
      ) VALUES (
        v_prop_id, 'Serene Haven Luxury PG for Women', '12th Main Road, HAL 2nd Stage, Indiranagar', 'Bengaluru', 'Karnataka', 'Bengaluru Urban', '9876543212',
        12.9784, 77.6408, 'FEMALE', 11000.00, 4.9, 45,
        TRUE, TRUE, 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80',
        '["https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80"]'::jsonb,
        '["WiFi", "Food", "AC", "24/7 Security", "Biometric Access", "Attached Bath"]'::jsonb,
        'Safe, highly secured premium womens PG in Indiranagar. Features biometric entry, 24/7 warden, CCTV, and nutritious hygienic food.'
      ) RETURNING id INTO v_b2;

      INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
      VALUES (v_b2, 2, 'IN-201', 'Single', 16000.00, 25000.00, 'AVAILABLE') RETURNING id INTO v_r1;
      INSERT INTO beds (room_id, bed_number, status) VALUES (v_r1, 'IN-201-A', 'AVAILABLE');

      INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
      VALUES (v_b2, 2, 'IN-202', 'Double', 11000.00, 18000.00, 'AVAILABLE') RETURNING id INTO v_r2;
      INSERT INTO beds (room_id, bed_number, status) VALUES (v_r2, 'IN-202-A', 'AVAILABLE'), (v_r2, 'IN-202-B', 'AVAILABLE');
    END IF;

    -- 3. HSR Layout PG (~9.5 km from Center) - Male PG
    IF NOT EXISTS (SELECT 1 FROM branches WHERE name = 'TechNest Men PG & Co-Living') THEN
      INSERT INTO branches (
        property_id, name, address, city, state, district, contact_number,
        latitude, longitude, pg_type, starting_monthly_rent, rating, total_reviews,
        food_available, ac_available, cover_image, images, amenities, description
      ) VALUES (
        v_prop_id, 'TechNest Men PG & Co-Living', '27th Main, Sector 1, HSR Layout', 'Bengaluru', 'Karnataka', 'Bengaluru Urban', '9876543213',
        12.9121, 77.6446, 'MALE', 8000.00, 4.6, 78,
        TRUE, FALSE, 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80',
        '["https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80"]'::jsonb,
        '["WiFi", "Food", "Parking", "Gaming Lounge", "Power Backup"]'::jsonb,
        'Ideal stay for software developers and startup founders in HSR. Fast fiber internet, ergonomic study spaces, and community activities.'
      ) RETURNING id INTO v_b3;

      INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
      VALUES (v_b3, 1, 'H-101', 'Triple', 8000.00, 10000.00, 'AVAILABLE') RETURNING id INTO v_r1;
      INSERT INTO beds (room_id, bed_number, status) VALUES (v_r1, 'H-101-A', 'AVAILABLE'), (v_r1, 'H-101-B', 'AVAILABLE'), (v_r1, 'H-101-C', 'AVAILABLE');
    END IF;

    -- 4. Electronic City PG (~18.2 km from Center) - Unisex Co-Living
    IF NOT EXISTS (SELECT 1 FROM branches WHERE name = 'Silicon Heights Co-Living') THEN
      INSERT INTO branches (
        property_id, name, address, city, state, district, contact_number,
        latitude, longitude, pg_type, starting_monthly_rent, rating, total_reviews,
        food_available, ac_available, cover_image, images, amenities, description
      ) VALUES (
        v_prop_id, 'Silicon Heights Co-Living', 'Phase 1, Near Infosys Gate 3, Electronic City', 'Bengaluru', 'Karnataka', 'Bengaluru Urban', '9876543214',
        12.8452, 77.6602, 'UNISEX', 7500.00, 4.5, 52,
        TRUE, TRUE, 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80',
        '["https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80"]'::jsonb,
        '["WiFi", "Food", "AC", "Shuttle Service", "Gym", "Power Backup"]'::jsonb,
        'Walking distance from major tech parks in Electronic City. Affordable and premium options with free shuttle service to tech campuses.'
      ) RETURNING id INTO v_b4;

      INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
      VALUES (v_b4, 1, 'EC-101', 'Double', 7500.00, 10000.00, 'AVAILABLE') RETURNING id INTO v_r1;
      INSERT INTO beds (room_id, bed_number, status) VALUES (v_r1, 'EC-101-A', 'AVAILABLE'), (v_r1, 'EC-101-B', 'AVAILABLE');
    END IF;

    -- 5. Bidadi PG (~34.5 km from Center) - Within 40 km boundary
    IF NOT EXISTS (SELECT 1 FROM branches WHERE name = 'Green Meadows PG') THEN
      INSERT INTO branches (
        property_id, name, address, city, state, district, contact_number,
        latitude, longitude, pg_type, starting_monthly_rent, rating, total_reviews,
        food_available, ac_available, cover_image, images, amenities, description
      ) VALUES (
        v_prop_id, 'Green Meadows PG', 'Bengaluru-Mysuru Expressway, Bidadi Industrial Area', 'Bidadi', 'Karnataka', 'Ramanagara', '9876543215',
        12.7984, 77.3820, 'UNISEX', 6000.00, 4.3, 21,
        TRUE, FALSE, 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80',
        '["https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80"]'::jsonb,
        '["WiFi", "Food", "Parking", "Garden Area"]'::jsonb,
        'Spacious, green campus located in Bidadi near industrial corridor. Budget friendly rates with home cooked meals.'
      ) RETURNING id INTO v_b5;

      INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
      VALUES (v_b5, 1, 'GM-101', 'Double', 6000.00, 8000.00, 'AVAILABLE') RETURNING id INTO v_r1;
      INSERT INTO beds (room_id, bed_number, status) VALUES (v_r1, 'GM-101-A', 'AVAILABLE');
    END IF;

    -- 6. Ramanagara PG (~52 km from Center) - OUTSIDE 40 km (Exclusion check!)
    IF NOT EXISTS (SELECT 1 FROM branches WHERE name = 'Silk City Residency PG') THEN
      INSERT INTO branches (
        property_id, name, address, city, state, district, contact_number,
        latitude, longitude, pg_type, starting_monthly_rent, rating, total_reviews,
        food_available, ac_available, cover_image, images, amenities, description
      ) VALUES (
        v_prop_id, 'Silk City Residency PG', 'Main Road, Ramanagara Town', 'Ramanagara', 'Karnataka', 'Ramanagara', '9876543216',
        12.7209, 77.2799, 'MALE', 5000.00, 4.1, 14,
        TRUE, FALSE, 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80',
        '["https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80"]'::jsonb,
        '["WiFi", "Food"]'::jsonb,
        'Located in Ramanagara town beyond Bengaluru outer boundary. 52 km from Bengaluru city center.'
      ) RETURNING id INTO v_b_out;

      INSERT INTO rooms (branch_id, floor_number, room_number, room_type, monthly_rent, security_deposit, status)
      VALUES (v_b_out, 1, 'SC-101', 'Single', 5000.00, 6000.00, 'AVAILABLE') RETURNING id INTO v_r1;
      INSERT INTO beds (room_id, bed_number, status) VALUES (v_r1, 'SC-101-A', 'AVAILABLE');
    END IF;

  END IF;
END $$;
