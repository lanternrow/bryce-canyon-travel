-- ============================================
-- Migration 005: Category Expansion & Listing Re-Categorization
-- Creates 18 new categories and bulk re-categorizes ~100+ listings
-- that were incorrectly assigned by the Google Places type mapper.
-- ============================================

-- ============================================
-- SECTION 1: Create New Categories
-- ============================================

-- Dining (4 new)
INSERT INTO categories (name, slug, listing_type, icon)
VALUES
  ('BBQ & Smokehouse', 'bbq-smokehouse', 'dining', 'fire'),
  ('Grocery & Market', 'grocery-market', 'dining', 'cart-shopping'),
  ('Food Truck', 'food-truck', 'dining', 'truck'),
  ('Steakhouse', 'steakhouse', 'dining', 'utensils')
ON CONFLICT (slug, listing_type) DO NOTHING;

-- Lodging (4 new)
INSERT INTO categories (name, slug, listing_type, icon)
VALUES
  ('RV Park', 'rv-park', 'lodging', 'caravan'),
  ('Motel', 'motel', 'lodging', 'bed'),
  ('Resort', 'resort', 'lodging', 'water-ladder'),
  ('Cabin', 'cabin', 'lodging', 'house')
ON CONFLICT (slug, listing_type) DO NOTHING;

-- Experiences (8 new)
INSERT INTO categories (name, slug, listing_type, icon)
VALUES
  ('ATV & Off-Road', 'atv-off-road', 'experiences', 'truck-monster'),
  ('eBike Tour', 'ebike-tour', 'experiences', 'bicycle'),
  ('Winery & Vineyard', 'winery', 'experiences', 'wine-glass'),
  ('Guide Service', 'guide-service', 'experiences', 'compass'),
  ('Rock Climbing', 'rock-climbing', 'experiences', 'mountain'),
  ('River Activity', 'river-activity', 'experiences', 'water'),
  ('Spa & Wellness', 'spa-wellness', 'experiences', 'spa'),
  ('Art Gallery', 'art-gallery', 'experiences', 'palette')
ON CONFLICT (slug, listing_type) DO NOTHING;

-- Transportation (2 new)
INSERT INTO categories (name, slug, listing_type, icon)
VALUES
  ('Airport', 'airport', 'transportation', 'plane-departure'),
  ('E-Bike Rental', 'e-bike-rental', 'transportation', 'bicycle')
ON CONFLICT (slug, listing_type) DO NOTHING;


-- ============================================
-- SECTION 2: Re-Categorize DINING Listings
-- (Moving out of the American Restaurant catch-all)
-- ============================================

-- American Restaurant → Brewery & Bar
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'brewery-bar' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Zion Canyon Brew Pub',
    'Buckskin Tavern',
    'Scout Bar & Grill',
    'Cowboys & Angels Speakeasy Cocktail Parlor',
    'The Wilder Lounge',
    'Bourbon & Blues @ Balcony One Restaurant',
    'Jack''s Sports Grill'
  );

-- American Restaurant → Asian Restaurant
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'asian-restaurant' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Bamboo Chinese Restaurant',
    'Siam Sapp Thai Cuisine',
    'Thai Sapa',
    'Yokoso Japanese Cuisine',
    'Yu Kitchen 3',
    'FUSION HOUSE',
    'Red Fort Cuisine Of India'
  );

-- American Restaurant → Italian
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'italian' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Dulivia Ristorante Italiano'
  );

-- American Restaurant → Mexican
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'mexican' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'El Jinete',
    'El Rancho',
    'Mazatlan',
    'La Fonda Grill',
    'Maria''s Food Truck',
    'Havana Cabana the Taste of Cuba',
    'Peruvian Flavors'
  );

-- American Restaurant → Fast Food
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'fast-food' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Big Al''s Burgers at The Junction',
    'Champs Chicken',
    'Krispy Krunchy Chicken',
    'Sugar Knoll Chicken',
    'Iceberg Drive Inn - Springdale'
  );

-- American Restaurant → Dessert & Ice Cream
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'dessert-ice-cream' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Desert Smoothie',
    'Hoku Lani Shaved Ice',
    'The Soda Fountain'
  );

-- American Restaurant → Fine Dining
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'fine-dining' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Painted Pony Restaurant',
    'Sego Restaurant',
    'Anthera',
    'Wood Ash Rye',
    'Basalt',
    'Wild Thyme Bistro at Trees Ranch'
  );

-- American Restaurant → Cafe & Bakery
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'cafe-bakery' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Giddy Up Bagel',
    'Camp Outpost',
    'Origin Breakfast Buffet'
  );

-- American Restaurant → BBQ & Smokehouse (new)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'bbq-smokehouse' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Giff''s Barbecue',
    'Lonny Boy''s BBQ',
    'J&T Kettlecorn and BBQ',
    'Chuckwagon Cookouts',
    'PAPA''S GOT JERK'
  );

-- American Restaurant → Grocery & Market (new)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'grocery-market' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Glazier''s Market',
    'Sol Foods Supermarket',
    'VIRGIN TRADING POST/FORT ZION'
  );

-- American Restaurant → Steakhouse (new)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'steakhouse' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Anasazi Steakhouse',
    'Arrabiata Steakhouse Restaurant'
  );

-- American Restaurant → Pizza
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'pizza' AND listing_type = 'dining'),
    updated_at = NOW()
WHERE type = 'dining'
  AND name IN (
    'Slice of Zion'
  );


-- ============================================
-- SECTION 3: Re-Categorize LODGING Listings
-- ============================================

-- B&B/Inn → Hotel (chain hotels misidentified by Google)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'hotel' AND listing_type = 'lodging'),
    updated_at = NOW()
WHERE type = 'lodging'
  AND name IN (
    'Best Western Plus Abbey Inn',
    'Comfort Inn & Suites Zion Park Area',
    'Comfort Inn at Convention Center',
    'Days Inn & Suites by Wyndham Kanab',
    'Days Inn by Wyndham Hurricane/Zion National Park Area',
    'Fairfield by Marriott Inn & Suites Virgin Zion National Park',
    'Hampton Inn Kanab',
    'Hampton Inn St. George',
    'Holiday Inn Express & Suites Kanab by IHG',
    'Holiday Inn La Verkin Zion Park, an IHG Hotel',
    'La Quinta Inn & Suites by Wyndham Kanab',
    'La Quinta Inn & Suites by Wyndham La Verkin-Gateway to Zion',
    'La Quinta Inn & Suites by Wyndham St. George',
    'Quality Inn Kanab National Park Area',
    'Rodeway Inn Hurricane - Zion National Park Area',
    'Sleep Inn & Suites Hurricane Zion Park Area',
    'St. George Inn & Suites',
    'The Flagstone Boutique Inn & Suites'
  );

-- Campground → Hotel (Quality Inn is not a campground)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'hotel' AND listing_type = 'lodging'),
    updated_at = NOW()
WHERE type = 'lodging'
  AND name = 'Quality Inn Zion Park Area';

-- Hotel → RV Park (new)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'rv-park' AND listing_type = 'lodging'),
    updated_at = NOW()
WHERE type = 'lodging'
  AND name IN (
    'Grand Plateau RV Resort',
    'Gateway Luxury RV Resort & Casitas'
  );

-- NULL category → RV Park (new) — manually added RV parks with no category
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'rv-park' AND listing_type = 'lodging'),
    updated_at = NOW()
WHERE type = 'lodging'
  AND category_id IS NULL
  AND name IN (
    'Bauers Canyon Ranch RV Park',
    'Crazy Horse RV Resort',
    'Desert Canyons RV Resort',
    'Kaibab Paiute RV Park & Campground',
    'Mount Carmel Motel & RV Park',
    'Southern Utah RV Resort',
    'Temple View RV Resort'
  );

-- NULL category → Campground
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'campground' AND listing_type = 'lodging'),
    updated_at = NOW()
WHERE type = 'lodging'
  AND category_id IS NULL
  AND name IN (
    'Coral Pink Sand Dunes Campground',
    'Hi-Road Basecamp'
  );

-- Hotel → Motel (new)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'motel' AND listing_type = 'lodging'),
    updated_at = NOW()
WHERE type = 'lodging'
  AND name IN (
    'Chalet Motel',
    'Grand Canyon Motel',
    'Parkway Motel',
    'Sun-n-Sand Motel',
    'Travelers Motel',
    'Zion Park Motel',
    'Leeds RV Park & Motel'
  );

-- Archive non-lodging items that were in Hotel category
UPDATE listings
SET status = 'archived',
    updated_at = NOW()
WHERE type = 'lodging'
  AND name IN (
    'Sand Hollow State Park',
    'Snow Canyon State Park',
    'Zion Canyon Visitor Center',
    'Hurricane, UT',
    'Cave Lakes',
    'Cave Lakes Canyon'
  );


-- ============================================
-- SECTION 4: Re-Categorize EXPERIENCES Listings
-- ============================================

-- Tour Operator → ATV & Off-Road (new)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'atv-off-road' AND listing_type = 'experiences'),
    updated_at = NOW()
WHERE type = 'experiences'
  AND name IN (
    'ATV Offroad Adventures',
    'Coral Pink ATV Tours',
    'Hummer Off Road Tours',
    'Mild To Wild Rhino Tours',
    'Utah Offroad Tours',
    'Razors Edge Tours',
    'Mad Moose Rentals & Tours (Sand Hollow)'
  );

-- Tour Operator → eBike Tour (new)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'ebike-tour' AND listing_type = 'experiences'),
    updated_at = NOW()
WHERE type = 'experiences'
  AND name IN (
    'Ebikes Zion - Powered By Zionic Adventures',
    'Free Wheels Zion',
    'Greater Zion eBikes',
    'Outta Here eBikes',
    'Utah eBike Adventures',
    'Zion EBikes-Powered by Magnum',
    'Zion Peddler'
  );

-- Tour Operator → River Activity (new)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'river-activity' AND listing_type = 'experiences'),
    updated_at = NOW()
WHERE type = 'experiences'
  AND name IN (
    'Float Zion Tubing',
    'Zion Tubing',
    'Zion Rivers Edge Adventures'
  );

-- Tour Operator → Art Gallery (new)
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'art-gallery' AND listing_type = 'experiences'),
    updated_at = NOW()
WHERE type = 'experiences'
  AND name IN (
    'David J. West Gallery',
    'Zion Rock & Gem'
  );


-- ============================================
-- SECTION 5: Cross-Type Fixes
-- ============================================

-- Zion Vineyards: type=experiences but category=american-restaurant → category=winery
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'winery' AND listing_type = 'experiences'),
    updated_at = NOW()
WHERE name = 'Zion Vineyards'
  AND type = 'experiences';

-- Harry Reid International Airport: type=dining, no category → type=transportation, category=airport
UPDATE listings
SET type = 'transportation',
    category_id = (SELECT id FROM categories WHERE slug = 'airport' AND listing_type = 'transportation'),
    updated_at = NOW()
WHERE name = 'Harry Reid International Airport';

-- St. George Regional Airport: car-rental → airport
UPDATE listings
SET category_id = (SELECT id FROM categories WHERE slug = 'airport' AND listing_type = 'transportation'),
    updated_at = NOW()
WHERE name = 'St. George Regional Airport (SGU)'
  AND type = 'transportation';
