-- ============================================
-- ZION TRAVEL — Seed Data
-- ============================================

-- ============================================
-- LOCATIONS (towns around Zion)
-- ============================================

INSERT INTO locations (name, slug, lat, lng, description, display_order) VALUES
('Springdale', 'springdale', 37.1889, -112.9983, 'Gateway town to Zion National Park', 1),
('Virgin', 'virgin', 37.2061, -113.1845, 'Quiet community along the Virgin River', 2),
('Hurricane', 'hurricane', 37.1753, -113.2899, 'Largest city near Zion with full amenities', 3),
('La Verkin', 'la-verkin', 37.2006, -113.2685, 'Small town between Hurricane and Virgin', 4),
('Orderville', 'orderville', 37.2740, -112.6347, 'East entrance gateway to Zion', 5),
('Mount Carmel Junction', 'mount-carmel-junction', 37.2375, -112.6841, 'Junction town east of the Zion tunnel', 6),
('Rockville', 'rockville', 37.1653, -113.0447, 'Historic town just south of Springdale', 7),
('Hildale', 'hildale', 37.0038, -112.9674, 'Near the Arizona border, access to lesser-known areas', 8),
('Kanab', 'kanab', 37.0475, -112.5263, 'Little Hollywood — gateway to Grand Staircase', 9),
('St. George', 'st-george', 37.0965, -113.5684, 'Major regional city with airport', 10),
('Las Vegas', 'las-vegas', 36.1699, -115.1398, 'Major gateway city with airport access to Zion-bound travelers', 11),
('Zion National Park', 'zion-national-park', 37.2982, -113.0263, 'Inside the park boundaries', 0);

-- ============================================
-- CATEGORIES
-- ============================================

-- Dining categories (slugs match production DB)
INSERT INTO categories (name, slug, listing_type, icon) VALUES
('American Restaurant', 'american-restaurant', 'dining', 'utensils'),
('Mexican', 'mexican', 'dining', 'utensils'),
('Italian', 'italian', 'dining', 'utensils'),
('Asian Restaurant', 'asian-restaurant', 'dining', 'utensils'),
('Pizza', 'pizza', 'dining', 'pizza-slice'),
('Cafe & Bakery', 'cafe-bakery', 'dining', 'coffee'),
('Brewery & Bar', 'brewery-bar', 'dining', 'beer-mug-empty'),
('Fine Dining', 'fine-dining', 'dining', 'champagne-glasses'),
('Fast Food', 'fast-food', 'dining', 'burger'),
('Food Truck', 'food-truck', 'dining', 'truck'),
('Dessert & Ice Cream', 'dessert-ice-cream', 'dining', 'ice-cream'),
('Seafood', 'seafood', 'dining', 'fish'),
('BBQ & Smokehouse', 'bbq-smokehouse', 'dining', 'fire'),
('Grocery & Market', 'grocery-market', 'dining', 'cart-shopping'),
('Steakhouse', 'steakhouse', 'dining', 'utensils');

-- Lodging categories (slugs match production DB)
INSERT INTO categories (name, slug, listing_type, icon) VALUES
('Hotel', 'hotel', 'lodging', 'hotel'),
('Motel', 'motel', 'lodging', 'bed'),
('B&B / Inn', 'bb-inn', 'lodging', 'house-chimney'),
('Cabin', 'cabin', 'lodging', 'house'),
('Campground', 'campground', 'lodging', 'campground'),
('Glamping', 'glamping', 'lodging', 'tent'),
('Vacation Rental', 'vacation-rental', 'lodging', 'key'),
('Resort', 'resort', 'lodging', 'water-ladder'),
('RV Park', 'rv-park', 'lodging', 'caravan');

-- Experiences categories (slugs match production DB)
INSERT INTO categories (name, slug, listing_type, icon) VALUES
('Tour Operator', 'tour-operator', 'experiences', 'map'),
('Guide Service', 'guide-service', 'experiences', 'compass'),
('Gear Rental', 'gear-rental', 'experiences', 'toolbox'),
('ATV & Off-Road', 'atv-off-road', 'experiences', 'truck-monster'),
('Horseback Riding', 'horseback-riding', 'experiences', 'horse'),
('Rock Climbing', 'rock-climbing', 'experiences', 'mountain'),
('Canyoneering', 'canyoneering', 'experiences', 'person-hiking'),
('Photography Tour', 'photography-tour', 'experiences', 'camera'),
('River Activity', 'river-activity', 'experiences', 'water'),
('Spa & Wellness', 'spa-wellness', 'experiences', 'spa'),
('eBike Tour', 'ebike-tour', 'experiences', 'bicycle'),
('Winery & Vineyard', 'winery', 'experiences', 'wine-glass'),
('Art Gallery', 'art-gallery', 'experiences', 'palette'),
('Points of Interest', 'points-of-interest', 'experiences', 'map-pin'),
('Recreation', 'recreation', 'experiences', 'gamepad');

-- Hiking categories
INSERT INTO categories (name, slug, listing_type, icon) VALUES
('Day Hike', 'day-hike', 'hiking', 'person-hiking'),
('Canyon Hike', 'canyon-hike', 'hiking', 'mountain'),
('Viewpoint', 'viewpoint', 'hiking', 'binoculars'),
('Backpacking', 'backpacking', 'hiking', 'backpack');

-- Transportation categories (slugs match production DB)
INSERT INTO categories (name, slug, listing_type, icon) VALUES
('Shuttle Service', 'shuttle-service', 'transportation', 'bus'),
('Car Rental', 'car-rental', 'transportation', 'car'),
('Bike Rental', 'bike-rental', 'transportation', 'bicycle'),
('E-Bike Rental', 'e-bike-rental', 'transportation', 'bicycle'),
('Airport', 'airport', 'transportation', 'plane-departure');

-- ============================================
-- AMENITIES
-- ============================================

INSERT INTO amenities (name, slug, icon, category, display_order) VALUES
-- General
('Free WiFi', 'free-wifi', 'wifi', 'general', 1),
('Free Parking', 'free-parking', 'square-parking', 'general', 2),
('Wheelchair Accessible', 'wheelchair-accessible', 'wheelchair', 'general', 3),
('Pet Friendly', 'pet-friendly', 'paw', 'general', 4),
('Family Friendly', 'family-friendly', 'children', 'general', 5),
('Air Conditioning', 'air-conditioning', 'snowflake', 'general', 6),
('EV Charging', 'ev-charging', 'charging-station', 'general', 7),

-- Lodging-specific
('Swimming Pool', 'swimming-pool', 'person-swimming', 'lodging', 10),
('Hot Tub', 'hot-tub', 'hot-tub-person', 'lodging', 11),
('Fitness Center', 'fitness-center', 'dumbbell', 'lodging', 12),
('Kitchen', 'kitchen', 'kitchen-set', 'lodging', 13),
('Laundry', 'laundry', 'shirt', 'lodging', 14),
('Continental Breakfast', 'continental-breakfast', 'mug-hot', 'lodging', 15),
('Fire Pit', 'fire-pit', 'fire', 'lodging', 16),
('BBQ Grill', 'bbq-grill', 'fire-burner', 'lodging', 17),
('Scenic Views', 'scenic-views', 'mountain-sun', 'lodging', 18),

-- Dining-specific
('Outdoor Seating', 'outdoor-seating', 'umbrella-beach', 'dining', 20),
('Live Entertainment', 'live-entertainment', 'music', 'dining', 21),
('Full Bar', 'full-bar', 'martini-glass', 'dining', 22),
('Reservations', 'reservations', 'calendar-check', 'dining', 23),
('Takeout', 'takeout', 'bag-shopping', 'dining', 24),
('Delivery', 'delivery', 'truck-fast', 'dining', 25),
('Vegan Options', 'vegan-options', 'leaf', 'dining', 26),
('Gluten-Free Options', 'gluten-free', 'wheat-awn-circle-exclamation', 'dining', 27),
('Kids Menu', 'kids-menu', 'child', 'dining', 28),
('Dine-In', 'dine-in', 'utensils', 'dining', 29),
('Curbside Pickup', 'curbside-pickup', 'car-side', 'dining', 30),

-- General (continued)
('Accepts Credit Cards', 'accepts-credit-cards', 'credit-card', 'general', 8),

-- Experience/Outdoor
('Gear Provided', 'gear-provided', 'toolbox', 'outdoor', 30),
('Guide Included', 'guide-included', 'user-tie', 'outdoor', 31),
('Shuttle to Trailhead', 'shuttle-to-trailhead', 'bus', 'outdoor', 32),
('Water Available', 'water-available', 'bottle-water', 'outdoor', 33),
('Restrooms', 'restrooms', 'restroom', 'outdoor', 34),
('Shade Available', 'shade-available', 'tree', 'outdoor', 35);

-- ============================================
-- SAMPLE LISTINGS — Dining
-- ============================================

INSERT INTO listings (id, type, name, slug, tagline, description, category_id, location_id, address, city, state, zip, lat, lng, phone, email, website, price_range, status, is_featured) VALUES
(uuid_generate_v4(), 'dining', 'Oscar''s Cafe', 'oscars-cafe', 'A Springdale institution since 1989', 'Oscar''s Cafe has been serving up generous portions of classic American and Southwestern fare to hungry hikers and travelers since 1989. Known for their massive breakfasts, fresh-squeezed lemonade, and friendly patio atmosphere, it''s the perfect spot to fuel up before or after a day in the canyon.', (SELECT id FROM categories WHERE slug='american-restaurant' AND listing_type='dining'), (SELECT id FROM locations WHERE slug='springdale'), '948 Zion Park Blvd', 'Springdale', 'UT', '84767', 37.1876, -112.9985, '435-772-3232', NULL, 'https://www.oscarscafe.com', '$$', 'published', true),

(uuid_generate_v4(), 'dining', 'Bit & Spur Restaurant & Saloon', 'bit-and-spur', 'Creative Southwestern cuisine with a full bar', 'A Springdale legend since 1981, Bit & Spur serves innovative Southwestern-inspired cuisine with locally sourced ingredients. Their patio offers stunning views of Zion''s canyon walls while you enjoy craft cocktails and dishes like their famous sweet potato tamales.', (SELECT id FROM categories WHERE slug='american-restaurant' AND listing_type='dining'), (SELECT id FROM locations WHERE slug='springdale'), '1212 Zion Park Blvd', 'Springdale', 'UT', '84767', 37.1855, -112.9999, '435-772-3498', NULL, 'https://www.bitandspur.com', '$$$', 'published', true),

(uuid_generate_v4(), 'dining', 'Thai Sapa', 'thai-sapa', 'Authentic Thai and Vietnamese flavors at Zion''s doorstep', 'Bringing Southeast Asian flavors to southern Utah, Thai Sapa offers a refreshing alternative to the usual park-town fare. Fresh curries, pho, and stir-fry dishes provide the perfect recovery meal after a long hike.', (SELECT id FROM categories WHERE slug='asian-restaurant' AND listing_type='dining'), (SELECT id FROM locations WHERE slug='springdale'), '145 Zion Park Blvd', 'Springdale', 'UT', '84767', 37.1920, -112.9950, '435-772-0510', NULL, NULL, '$$', 'published', false),

(uuid_generate_v4(), 'dining', 'Balcony One', 'balcony-one', 'Mediterranean-inspired American dining in Virgin', 'Balcony One in Virgin, UT, is a local American restaurant with a Mediterranean twist. Their large menu consists of tasty dishes made fresh when you order. From a cocktail bar full of your favorite drinks to live entertainment, it''s a great time.', (SELECT id FROM categories WHERE slug='american-restaurant' AND listing_type='dining'), (SELECT id FROM locations WHERE slug='virgin'), '770 West State Rd 9', 'Virgin', 'UT', '84779', 37.2061, -113.1845, '435-635-7141', NULL, 'https://www.balconyonevirgin.com', '$$', 'published', false);

-- ============================================
-- SAMPLE LISTINGS — Lodging
-- ============================================

INSERT INTO listings (id, type, name, slug, tagline, description, category_id, location_id, address, city, state, zip, lat, lng, phone, website, price_range, status, is_featured) VALUES
(uuid_generate_v4(), 'lodging', 'Cable Mountain Lodge', 'cable-mountain-lodge', 'Luxury suites steps from the park entrance', 'Cable Mountain Lodge puts you right at the doorstep of Zion National Park. Spacious suites with full kitchens, private balconies, and mountain views make this the perfect basecamp for your Zion adventure.', (SELECT id FROM categories WHERE slug='hotel' AND listing_type='lodging'), (SELECT id FROM locations WHERE slug='springdale'), '147 Zion Park Blvd', 'Springdale', 'UT', '84767', 37.1925, -112.9944, '435-772-3366', 'https://www.cablemountainlodge.com', '$$$', 'published', true),

(uuid_generate_v4(), 'lodging', 'Zion Lodge', 'zion-lodge', 'The only lodging inside the park', 'Zion Lodge is the sole accommodation inside Zion National Park, offering historic cabins and modern hotel rooms surrounded by towering canyon walls. Guests enjoy unmatched access to trailheads, the park shuttle, and the serene beauty of Zion Canyon.', (SELECT id FROM categories WHERE slug='hotel' AND listing_type='lodging'), (SELECT id FROM locations WHERE slug='zion-national-park'), 'Zion Canyon Scenic Dr', 'Springdale', 'UT', '84767', 37.2502, -112.9561, '435-772-7700', 'https://www.zionlodge.com', '$$$$', 'published', true),

(uuid_generate_v4(), 'lodging', 'Under Canvas Zion', 'under-canvas-zion', 'Luxury glamping near the park', 'Under Canvas Zion offers a safari-inspired glamping experience on 196 acres near Zion National Park. Sleep in beautifully appointed tents with en-suite bathrooms, real beds, and woodburning stoves while being surrounded by the stunning Utah landscape.', (SELECT id FROM categories WHERE slug='glamping' AND listing_type='lodging'), (SELECT id FROM locations WHERE slug='virgin'), '3955 Kolob Terrace Rd', 'Virgin', 'UT', '84779', 37.2350, -113.1200, '888-496-1148', 'https://www.undercanvas.com/camps/zion/', '$$$$', 'published', true);

-- ============================================
-- SAMPLE LISTINGS — Hiking
-- ============================================

INSERT INTO listings (id, type, name, slug, tagline, description, category_id, location_id, address, city, state, zip, lat, lng, status, is_featured) VALUES
(uuid_generate_v4(), 'hiking', 'Angels Landing', 'angels-landing', 'Zion''s most iconic and thrilling trail', 'Angels Landing is one of the most famous hikes in the world. The final half-mile follows a razor-thin ridge with chain handrails and sheer 1,000-foot drop-offs on both sides. The reward: a 360-degree panorama of Zion Canyon that will take your breath away. Permit required.', (SELECT id FROM categories WHERE slug='hiking-trail' AND listing_type='hiking'), (SELECT id FROM locations WHERE slug='zion-national-park'), 'The Grotto Trailhead', 'Springdale', 'UT', '84767', 37.2594, -112.9508, 'published', true),

(uuid_generate_v4(), 'hiking', 'The Narrows', 'the-narrows', 'Wade through the Virgin River in a stunning slot canyon', 'The Narrows is Zion''s premier water hike, where you wade and sometimes swim through the Virgin River as thousand-foot canyon walls tower above you. The bottom-up route starts at the Temple of Sinawava and goes as far as you want. An unforgettable experience.', (SELECT id FROM categories WHERE slug='canyon-hike' AND listing_type='hiking'), (SELECT id FROM locations WHERE slug='zion-national-park'), 'Temple of Sinawava', 'Springdale', 'UT', '84767', 37.2851, -112.9478, 'published', true),

(uuid_generate_v4(), 'hiking', 'Observation Point', 'observation-point', 'The highest viewpoint in Zion Canyon', 'Observation Point delivers what many consider the best view in Zion — standing 2,148 feet above the canyon floor, looking directly down at Angels Landing. The trail is long and strenuous but rewards with an unmatched perspective of the entire canyon.', (SELECT id FROM categories WHERE slug='hiking-trail' AND listing_type='hiking'), (SELECT id FROM locations WHERE slug='zion-national-park'), 'East Mesa Trailhead', 'Springdale', 'UT', '84767', 37.2736, -112.9375, 'published', true),

(uuid_generate_v4(), 'hiking', 'Canyon Overlook Trail', 'canyon-overlook-trail', 'Short but rewarding viewpoint hike', 'A short 1-mile round-trip trail that packs a punch. Starting just east of the Zion-Mount Carmel Tunnel, this easy-to-moderate hike leads to a stunning overlook of Pine Creek Canyon and lower Zion Canyon. Perfect for families and those short on time.', (SELECT id FROM categories WHERE slug='viewpoint' AND listing_type='hiking'), (SELECT id FROM locations WHERE slug='zion-national-park'), 'East side of Zion-Mt Carmel Tunnel', 'Springdale', 'UT', '84767', 37.2128, -112.9389, 'published', false);

-- ============================================
-- HIKING DETAILS for sample hikes
-- ============================================

INSERT INTO hiking_details (listing_id, difficulty, trail_type, distance_miles, elevation_gain_ft, estimated_time, permit_required, dogs_allowed, kid_friendly, water_available, shade_level, season_start, season_end)
SELECT id, 'hard', 'out_and_back', 5.4, 1488, '3-5 hours', true, false, false, false, 'partial', 'March', 'November'
FROM listings WHERE slug = 'angels-landing';

INSERT INTO hiking_details (listing_id, difficulty, trail_type, distance_miles, elevation_gain_ft, estimated_time, permit_required, dogs_allowed, kid_friendly, water_available, shade_level, season_start, season_end)
SELECT id, 'moderate', 'out_and_back', 9.4, 334, '4-8 hours', false, false, false, true, 'full', 'June', 'October'
FROM listings WHERE slug = 'the-narrows';

INSERT INTO hiking_details (listing_id, difficulty, trail_type, distance_miles, elevation_gain_ft, estimated_time, permit_required, dogs_allowed, kid_friendly, water_available, shade_level, season_start, season_end)
SELECT id, 'hard', 'out_and_back', 8.0, 2148, '4-6 hours', false, false, false, false, 'partial', 'April', 'November'
FROM listings WHERE slug = 'observation-point';

INSERT INTO hiking_details (listing_id, difficulty, trail_type, distance_miles, elevation_gain_ft, estimated_time, permit_required, dogs_allowed, kid_friendly, water_available, shade_level, season_start, season_end)
SELECT id, 'easy', 'out_and_back', 1.0, 163, '30-60 minutes', false, false, true, false, 'partial', 'Year-round', 'Year-round'
FROM listings WHERE slug = 'canyon-overlook-trail';

-- ============================================
-- SAMPLE LISTINGS — Experiences
-- ============================================

INSERT INTO listings (id, type, name, slug, tagline, description, category_id, location_id, address, city, state, zip, lat, lng, phone, website, price_range, status, is_featured) VALUES
(uuid_generate_v4(), 'experiences', 'East Zion Adventures', 'east-zion-adventures', 'Guided canyoneering, rappelling, and UTV tours', 'East Zion Adventures offers guided outdoor experiences on the less-crowded east side of Zion. From canyoneering in stunning slot canyons to UTV tours through red rock country, their expert guides deliver unforgettable adventures for all skill levels.', (SELECT id FROM categories WHERE slug='tour-operator' AND listing_type='experiences'), (SELECT id FROM locations WHERE slug='orderville'), '5065 N Main St', 'Orderville', 'UT', '84758', 37.2740, -112.6347, '833-297-2712', 'https://www.eastzionadventures.com', '$$', 'published', true),

(uuid_generate_v4(), 'experiences', 'Zion Rock & Mountain Guides', 'zion-rock-mountain-guides', 'Expert climbing and canyoneering guides', 'The premier guide service in Zion for rock climbing and canyoneering. Whether you are a beginner looking to try climbing for the first time or an experienced climber seeking a challenging multi-pitch route, their certified guides will get you there safely.', (SELECT id FROM categories WHERE slug='guide-service' AND listing_type='experiences'), (SELECT id FROM locations WHERE slug='springdale'), '1458 Zion Park Blvd', 'Springdale', 'UT', '84767', 37.1840, -113.0010, '435-772-3303', 'https://www.zionrockguides.com', '$$$', 'published', true);

-- ============================================
-- EXPERIENCE DETAILS
-- ============================================

INSERT INTO experience_details (listing_id, experience_type, duration, group_size_min, group_size_max, age_minimum, skill_level, gear_provided, booking_url, season_start, season_end)
SELECT id, 'tour_operator', '3-8 hours', 2, 12, 8, 'beginner', true, 'https://www.eastzionadventures.com/book', 'March', 'November'
FROM listings WHERE slug = 'east-zion-adventures';

INSERT INTO experience_details (listing_id, experience_type, duration, group_size_min, group_size_max, age_minimum, skill_level, gear_provided, booking_url, season_start, season_end)
SELECT id, 'guide_service', '4-8 hours', 1, 6, 10, 'beginner', true, 'https://www.zionrockguides.com/book', 'Year-round', 'Year-round'
FROM listings WHERE slug = 'zion-rock-mountain-guides';

-- ============================================
-- SAMPLE BUSINESS HOURS
-- ============================================

-- Oscar's Cafe hours
INSERT INTO business_hours (listing_id, day, open_time, close_time, is_closed)
SELECT id, d.day, '07:00', '21:00', false
FROM listings, (VALUES ('monday'::day_of_week), ('tuesday'::day_of_week), ('wednesday'::day_of_week), ('thursday'::day_of_week), ('friday'::day_of_week), ('saturday'::day_of_week), ('sunday'::day_of_week)) AS d(day)
WHERE slug = 'oscars-cafe';

-- ============================================
-- ADMIN USER (placeholder — you'll set the real password hash)
-- ============================================

INSERT INTO users (email, name, role) VALUES
('info@zion.travel', 'Zion Travel Admin', 'admin');
