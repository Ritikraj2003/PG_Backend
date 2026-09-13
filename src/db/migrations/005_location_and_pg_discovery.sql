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
