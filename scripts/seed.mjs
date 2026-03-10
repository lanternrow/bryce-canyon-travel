import postgres from "postgres";

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: "require" });

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const locations = [
  { id: 1, name: "Springdale", slug: "springdale" },
  { id: 2, name: "Virgin", slug: "virgin" },
  { id: 3, name: "Hurricane", slug: "hurricane" },
  { id: 4, name: "Kanab", slug: "kanab" },
  { id: 5, name: "St. George", slug: "st-george" },
  { id: 6, name: "Orderville", slug: "orderville" },
  { id: 7, name: "Zion National Park", slug: "zion-national-park" },
  { id: 8, name: "Hilldale", slug: "hilldale" },
  { id: 9, name: "Bryce Canyon City", slug: "bryce-canyon-city" },
  { id: 10, name: "Las Vegas", slug: "las-vegas" },
];

const categories = [
  // Dining
  { id: 1, name: "American Restaurant", slug: "american-restaurant", listing_type: "dining" },
  { id: 2, name: "Mexican", slug: "mexican", listing_type: "dining" },
  { id: 3, name: "Pizza", slug: "pizza", listing_type: "dining" },
  { id: 4, name: "Cafe & Bakery", slug: "cafe-bakery", listing_type: "dining" },
  { id: 5, name: "Fine Dining", slug: "fine-dining", listing_type: "dining" },
  // Lodging
  { id: 10, name: "Hotel", slug: "hotel", listing_type: "lodging" },
  { id: 11, name: "Vacation Rental", slug: "vacation-rental", listing_type: "lodging" },
  { id: 12, name: "Glamping", slug: "glamping", listing_type: "lodging" },
  { id: 13, name: "Campground", slug: "campground", listing_type: "lodging" },
  { id: 14, name: "B&B / Inn", slug: "bb-inn", listing_type: "lodging" },
  // Experiences
  { id: 20, name: "Tour Operator", slug: "tour-operator", listing_type: "experiences" },
  { id: 21, name: "Gear Rental", slug: "gear-rental", listing_type: "experiences" },
  { id: 22, name: "Canyoneering", slug: "canyoneering", listing_type: "experiences" },
  { id: 23, name: "Horseback Riding", slug: "horseback-riding", listing_type: "experiences" },
  { id: 24, name: "Photography Tour", slug: "photography-tour", listing_type: "experiences" },
  // Hiking
  { id: 30, name: "Day Hike", slug: "day-hike", listing_type: "hiking" },
  { id: 31, name: "Canyon Hike", slug: "canyon-hike", listing_type: "hiking" },
  { id: 32, name: "Viewpoint", slug: "viewpoint", listing_type: "hiking" },
  { id: 33, name: "Backpacking", slug: "backpacking", listing_type: "hiking" },
  // Transportation
  { id: 40, name: "Shuttle Service", slug: "shuttle-service", listing_type: "transportation" },
  { id: 41, name: "Car Rental", slug: "car-rental", listing_type: "transportation" },
  { id: 42, name: "Bike Rental", slug: "bike-rental", listing_type: "transportation" },
];

const amenities = [
  { id: 1, name: "Outdoor Seating", slug: "outdoor-seating", icon: "sun" },
  { id: 2, name: "Full Bar", slug: "full-bar", icon: "beer" },
  { id: 3, name: "Reservations", slug: "reservations", icon: "calendar" },
  { id: 4, name: "Kids Menu", slug: "kids-menu", icon: "child" },
  { id: 5, name: "Pet Friendly", slug: "pet-friendly", icon: "paw" },
  { id: 6, name: "Takeout", slug: "takeout", icon: "bag" },
  { id: 7, name: "Vegan Options", slug: "vegan-options", icon: "leaf" },
  { id: 8, name: "Free WiFi", slug: "free-wifi", icon: "wifi" },
  { id: 9, name: "Parking", slug: "parking", icon: "car" },
  { id: 10, name: "Restrooms at Trailhead", slug: "restrooms", icon: "restroom" },
  { id: 11, name: "Shuttle Access", slug: "shuttle-access", icon: "bus" },
  { id: 12, name: "Water at Trailhead", slug: "water", icon: "water" },
  { id: 13, name: "Swimming Pool", slug: "swimming-pool", icon: "pool" },
  { id: 14, name: "Hot Tub", slug: "hot-tub", icon: "hot-tub" },
  { id: 15, name: "Free Parking", slug: "free-parking", icon: "car" },
  { id: 16, name: "Kitchen", slug: "kitchen", icon: "kitchen" },
  { id: 17, name: "Fitness Center", slug: "fitness-center", icon: "dumbbell" },
  { id: 18, name: "Continental Breakfast", slug: "continental-breakfast", icon: "coffee" },
];

// Full descriptions
const oscarsCafeDescription =
  "Oscar's Cafe has been serving up hearty breakfasts, lunches, and dinners to Zion visitors and locals since 1989. Located in the heart of Springdale, our restaurant features a spacious outdoor patio with stunning views of Zion's towering sandstone cliffs.\n\nOur menu features a mix of classic American fare and Southwestern-inspired dishes, made from scratch with fresh, local ingredients wherever possible. From our famous breakfast burritos to our hand-pressed burgers and house-made desserts, there's something for everyone.\n\nWhether you're fueling up before a big hike or winding down after a day in the park, Oscar's is the perfect spot. Our full bar offers local craft beers, signature cocktails, and an approachable wine list.";

const angelsLandingDescription =
  "Angels Landing is one of the most famous hikes in the United States and the crown jewel of Zion National Park. This challenging trail rewards hikers with a breathtaking 360-degree panorama of Zion Canyon from a narrow sandstone fin towering 1,488 feet above the Virgin River.\n\nThe trail begins at the Grotto trailhead and follows the West Rim Trail up Walter's Wiggles, a series of 21 steep switchbacks carved into the cliff face. After reaching Scout Lookout, the final half-mile to the summit involves a steep, narrow ridge with chain-assisted sections and dramatic drop-offs on both sides.\n\nA lottery permit is required for the final chain section beyond Scout Lookout. Permits can be obtained through recreation.gov as a seasonal lottery or a day-before lottery. The hike to Scout Lookout does not require a permit and offers excellent views on its own.";

const listings = [
  // ---- Dining (7) ----
  {
    id: "d1",
    type: "dining",
    name: "Oscar's Cafe",
    slug: "oscars-cafe",
    tagline: "A Springdale institution since 1989",
    description: oscarsCafeDescription,
    city: "Springdale",
    state: "UT",
    address: "948 Zion Park Blvd, Springdale, UT 84767",
    category_id: 1,
    location_id: 1,
    phone: "(435) 772-3232",
    email: "info@oscarscafe.com",
    website: "https://oscarscafe.com",
    price_range: "$$",
    avg_rating: 4.5,
    review_count: 127,
    is_featured: true,
    view_count: 340,
  },
  {
    id: "d2",
    type: "dining",
    name: "Bit & Spur",
    slug: "bit-and-spur",
    tagline: "Creative Southwestern cuisine with local flair",
    description: "Bit & Spur has been a Springdale favorite for decades, offering a creative menu that blends Southwestern flavors with fresh, locally sourced ingredients. The restaurant is known for its lively atmosphere, craft cocktails, and a patio that comes alive on warm evenings.\n\nFrom slow-roasted meats and wood-fired dishes to inventive vegetarian options, the menu is designed to surprise and satisfy. Pair your meal with a selection from their impressive list of regional beers and handcrafted margaritas.\n\nWhether you are celebrating a special occasion or just looking for a memorable dinner after a day exploring Zion, Bit & Spur delivers an experience that keeps visitors coming back year after year.",
    city: "Springdale",
    state: "UT",
    address: "1212 Zion Park Blvd, Springdale, UT 84767",
    category_id: 1,
    location_id: 1,
    phone: "(435) 772-3498",
    email: "info@bitandspur.com",
    website: "https://bitandspur.com",
    price_range: "$$$",
    avg_rating: 4.7,
    review_count: 203,
    is_featured: true,
    view_count: 510,
  },
  {
    id: "d3",
    type: "dining",
    name: "Whiptail Grill",
    slug: "whiptail-grill",
    tagline: "Fresh Mexican-inspired fare with canyon views",
    description: "Whiptail Grill brings bright, fresh Mexican-inspired flavors to the heart of Springdale. Housed in a converted gas station with a charming patio, the restaurant offers tacos, burritos, and salads made with high-quality ingredients and bold seasonings.\n\nThe casual atmosphere and friendly staff make it a great stop for families and groups looking for a quick, satisfying meal without sacrificing quality. Don't miss the fish tacos or the house-made guacamole.\n\nWith views of the surrounding canyon walls and a relaxed vibe, Whiptail Grill is an ideal lunch stop before or after your Zion adventures.",
    city: "Springdale",
    state: "UT",
    address: "445 Zion Park Blvd, Springdale, UT 84767",
    category_id: 2,
    location_id: 1,
    phone: "(435) 772-0283",
    website: "https://whiptailgrill.com",
    price_range: "$$",
    avg_rating: 4.3,
    review_count: 89,
    is_featured: false,
    view_count: 220,
  },
  {
    id: "d4",
    type: "dining",
    name: "Cafe Soleil",
    slug: "cafe-soleil",
    tagline: "Artisan coffee and fresh-baked pastries",
    description: "Cafe Soleil is Springdale's go-to morning destination for artisan coffee, fresh pastries, and wholesome breakfast options. The cozy interior and sunny patio create the perfect setting to start your day before heading into Zion National Park.\n\nTheir espresso drinks are crafted with care using locally roasted beans, and the bakery case is filled daily with croissants, muffins, and seasonal treats. Light lunch options including sandwiches and salads are also available.\n\nWhether you need a quick caffeine fix or a leisurely breakfast, Cafe Soleil offers a warm, welcoming atmosphere that locals and visitors alike have come to love.",
    city: "Springdale",
    state: "UT",
    address: "205 Zion Park Blvd, Springdale, UT 84767",
    category_id: 4,
    location_id: 1,
    phone: "(435) 772-0505",
    website: "https://cafesoleilzion.com",
    price_range: "$",
    avg_rating: 4.6,
    review_count: 156,
    is_featured: false,
    view_count: 280,
  },
  {
    id: "d5",
    type: "dining",
    name: "The Spotted Dog Cafe",
    slug: "spotted-dog-cafe",
    tagline: "Upscale dining in a historic building",
    description: "The Spotted Dog Cafe offers an elevated dining experience in one of Springdale's most charming historic buildings, adjacent to the Flanigan's Inn. The menu showcases seasonal, locally sourced ingredients prepared with a refined touch.\n\nFrom pan-seared trout to perfectly grilled steaks and creative vegetarian entrees, every dish is crafted to highlight the flavors of the region. The wine list is thoughtfully curated to complement the menu.\n\nThe intimate dining room and garden patio provide a sophisticated yet relaxed setting, making it an ideal choice for special occasions or a memorable evening meal near the park.",
    city: "Springdale",
    state: "UT",
    address: "428 Zion Park Blvd, Springdale, UT 84767",
    category_id: 5,
    location_id: 1,
    phone: "(435) 772-0700",
    email: "info@spotteddogcafe.com",
    website: "https://flanigans.com/spotted-dog-cafe",
    price_range: "$$$$",
    avg_rating: 4.4,
    review_count: 67,
    is_featured: false,
    view_count: 190,
  },
  {
    id: "d6",
    type: "dining",
    name: "Zion Pizza & Noodle",
    slug: "zion-pizza-noodle",
    tagline: "Casual pizza in an old church",
    description: "Zion Pizza & Noodle is a beloved Springdale eatery housed in a converted historic church. The unique setting, complete with stained-glass windows and original wooden pews, creates an unforgettable dining atmosphere.\n\nThe menu features hand-tossed pizzas with creative toppings, hearty pasta dishes, and fresh salads. Local craft beers on tap and a selection of wines round out the experience. It is a great spot for families and groups.\n\nWith its laid-back vibe and consistently delicious food, Zion Pizza & Noodle has become a must-visit for anyone spending time in the Zion area. Expect a wait during peak season, but it is well worth it.",
    city: "Springdale",
    state: "UT",
    address: "868 Zion Park Blvd, Springdale, UT 84767",
    category_id: 3,
    location_id: 1,
    phone: "(435) 772-3815",
    website: "https://zionpizzanoodle.com",
    price_range: "$$",
    avg_rating: 4.2,
    review_count: 234,
    is_featured: false,
    view_count: 450,
  },
  {
    id: "d7",
    type: "dining",
    name: "Switchback Grille",
    slug: "switchback-grille",
    tagline: "Steaks and seafood at the park entrance",
    description: "Switchback Grille offers premium steaks, fresh seafood, and American classics just steps from the entrance to Zion National Park. The spacious dining room and outdoor terrace provide a comfortable setting to enjoy a hearty meal.\n\nThe menu features USDA choice steaks, wild-caught salmon, and a selection of pasta and poultry dishes. A full bar serves handcrafted cocktails, local microbrews, and an extensive wine list.\n\nWhether you are starting your Zion adventure or wrapping up a day on the trails, Switchback Grille is a reliable choice for quality food and attentive service in Springdale.",
    city: "Springdale",
    state: "UT",
    address: "1149 Zion Park Blvd, Springdale, UT 84767",
    category_id: 1,
    location_id: 1,
    phone: "(435) 772-3700",
    website: "https://switchbackgrille.com",
    price_range: "$$$",
    avg_rating: 4.1,
    review_count: 98,
    is_featured: false,
    view_count: 175,
  },
  // ---- Lodging (6) ----
  {
    id: "l1",
    type: "lodging",
    name: "Cable Mountain Lodge",
    slug: "cable-mountain-lodge",
    tagline: "Luxury suites at the park entrance",
    description: "Cable Mountain Lodge offers upscale accommodations just outside the south entrance of Zion National Park. Each suite features a full kitchen, private balcony, and modern furnishings designed to make your stay as comfortable as possible.\n\nGuests enjoy an outdoor heated pool and hot tub surrounded by towering red rock formations, a fitness center, and complimentary parking. The lodge is within walking distance of Springdale's shops, restaurants, and the park shuttle stop.\n\nWhether you are planning a weekend getaway or an extended stay, Cable Mountain Lodge provides a premium home base for exploring everything Zion has to offer.",
    city: "Springdale",
    state: "UT",
    address: "147 Zion Park Blvd, Springdale, UT 84767",
    category_id: 10,
    location_id: 1,
    phone: "(435) 772-3366",
    email: "info@cablemountainlodge.com",
    website: "https://cablemountainlodge.com",
    price_range: "$$$",
    avg_rating: 4.6,
    review_count: 89,
    is_featured: true,
    view_count: 320,
  },
  {
    id: "l2",
    type: "lodging",
    name: "Under Canvas Zion",
    slug: "under-canvas-zion",
    tagline: "Luxury glamping near the park",
    description: "Under Canvas Zion brings luxury to the great outdoors with beautifully appointed safari-style tents set against the dramatic backdrop of southern Utah's red rock country. Located near Virgin, it offers easy access to Zion National Park.\n\nEach tent features king-size beds with premium linens, en-suite bathrooms, and wood-burning stoves. Guests can gather around the communal fire pits, enjoy farm-to-table dining at the on-site restaurant, and stargaze under pristine dark skies.\n\nThis is glamping at its finest: all the wonder of sleeping under the stars without sacrificing comfort. Under Canvas Zion is perfect for couples, families, and anyone seeking a unique connection with nature.",
    city: "Virgin",
    state: "UT",
    address: "3955 Kolob Terrace Rd, Virgin, UT 84779",
    category_id: 12,
    location_id: 2,
    phone: "(888) 496-1148",
    email: "zion@undercanvas.com",
    website: "https://undercanvas.com/camps/zion",
    price_range: "$$$$",
    avg_rating: 4.8,
    review_count: 156,
    is_featured: true,
    view_count: 480,
  },
  {
    id: "l3",
    type: "lodging",
    name: "Cliffrose Lodge",
    slug: "cliffrose-lodge",
    tagline: "Riverside retreat with lush gardens",
    description: "Cliffrose Lodge & Gardens is a premier Springdale property situated on five acres of lush riverside gardens along the Virgin River. The newly renovated rooms and suites offer contemporary comfort with breathtaking views of Zion's towering cliffs.\n\nGuests enjoy direct river access, an outdoor pool and hot tub, and beautifully landscaped grounds perfect for relaxation. The lodge is conveniently located along the park shuttle route and is just a short walk from Springdale's dining and shopping district.\n\nCliffrose Lodge combines natural beauty with modern amenities, creating an unforgettable stay for anyone visiting Zion National Park.",
    city: "Springdale",
    state: "UT",
    address: "281 Zion Park Blvd, Springdale, UT 84767",
    category_id: 10,
    location_id: 1,
    phone: "(435) 772-3234",
    email: "info@cliffroselodge.com",
    website: "https://cliffroselodge.com",
    price_range: "$$$",
    avg_rating: 4.5,
    review_count: 201,
    is_featured: false,
    view_count: 390,
  },
  {
    id: "l4",
    type: "lodging",
    name: "Zion Ponderosa Ranch Resort",
    slug: "zion-ponderosa-ranch",
    tagline: "Cabins and adventure on the east rim",
    description: "Zion Ponderosa Ranch Resort sits on 4,000 acres bordering the east side of Zion National Park. The resort offers a wide range of accommodations from rustic cabins and vacation homes to RV sites and camping.\n\nOn-site activities include horseback riding, ATV tours, rappelling, a climbing wall, and guided hikes into Zion's backcountry. The resort also features a pool, tennis courts, and a restaurant serving hearty ranch-style meals.\n\nZion Ponderosa is ideal for families and groups seeking adventure combined with comfortable lodging in a stunning high-country setting above the park.",
    city: "Orderville",
    state: "UT",
    address: "Twin Knolls Rd, Orderville, UT 84758",
    category_id: 11,
    location_id: 6,
    phone: "(435) 648-2700",
    email: "info@zionponderosa.com",
    website: "https://zionponderosa.com",
    price_range: "$$",
    avg_rating: 4.3,
    review_count: 144,
    is_featured: false,
    view_count: 260,
  },
  {
    id: "l5",
    type: "lodging",
    name: "Watchman Campground",
    slug: "watchman-campground",
    tagline: "Camp alongside the Virgin River",
    description: "Watchman Campground is located inside Zion National Park near the south entrance, along the banks of the Virgin River. It offers tent and RV sites surrounded by cottonwood trees and towering sandstone cliffs.\n\nThe campground provides access to the park's shuttle system, making it easy to reach all major trailheads without a car. Amenities include restrooms, drinking water, fire grates, and picnic tables at each site.\n\nReservations are highly recommended, especially during the busy spring and fall seasons. Watchman Campground offers an immersive Zion experience for campers who want to sleep under the stars in the heart of the park.",
    city: "Zion National Park",
    state: "UT",
    address: "Zion Canyon Scenic Dr, Zion National Park, UT",
    category_id: 13,
    location_id: 7,
    phone: "(435) 772-3256",
    website: "https://recreation.gov",
    price_range: "$",
    avg_rating: 4.4,
    review_count: 312,
    is_featured: false,
    view_count: 550,
  },
  {
    id: "l6",
    type: "lodging",
    name: "Red Rock Inn",
    slug: "red-rock-inn",
    tagline: "Charming cottages in Springdale",
    description: "Red Rock Inn offers a collection of beautifully appointed private cottages nestled among gardens in Springdale. Each cottage features unique decor, comfortable beds, a kitchenette, and a private patio.\n\nThe property is known for its peaceful, intimate setting and personal touches, including a delivered breakfast basket each morning. It is an easy walk to the Zion shuttle stop, restaurants, and galleries.\n\nRed Rock Inn is perfect for couples and travelers seeking a quiet, romantic retreat close to the park. The innkeepers go above and beyond to ensure every guest feels at home.",
    city: "Springdale",
    state: "UT",
    address: "998 Zion Park Blvd, Springdale, UT 84767",
    category_id: 14,
    location_id: 1,
    phone: "(435) 772-3139",
    email: "info@redrockinn.com",
    website: "https://redrockinn.com",
    price_range: "$$",
    avg_rating: 4.7,
    review_count: 78,
    is_featured: false,
    view_count: 185,
  },
  // ---- Experiences (6) ----
  {
    id: "e1",
    type: "experiences",
    name: "East Zion Adventures",
    slug: "east-zion-adventures",
    tagline: "Guided canyoneering and UTV tours",
    description: "East Zion Adventures offers an incredible lineup of guided outdoor activities on the east side of Zion National Park. From thrilling canyoneering trips through narrow slot canyons to high-speed UTV tours across the rugged backcountry, there is an adventure for every skill level.\n\nAll excursions are led by experienced, certified guides who prioritize safety while ensuring an unforgettable experience. Gear and equipment are provided, and no prior experience is necessary for most tours.\n\nLocated in Orderville, East Zion Adventures provides easy access to trails and terrain that many visitors never discover. It is the perfect way to see a different side of the Zion area.",
    city: "Orderville",
    state: "UT",
    address: "90 E Main St, Orderville, UT 84758",
    category_id: 20,
    location_id: 6,
    phone: "(435) 644-3273",
    email: "info@eastzionadventures.com",
    website: "https://eastzionadventures.com",
    price_range: "$$",
    avg_rating: 4.9,
    review_count: 312,
    is_featured: true,
    view_count: 620,
  },
  {
    id: "e2",
    type: "experiences",
    name: "Zion Rock & Mountain Guides",
    slug: "zion-rock-mountain-guides",
    tagline: "Expert climbing and canyoneering instruction",
    description: "Zion Rock & Mountain Guides is the premier climbing and canyoneering outfitter in the Zion area. Their certified guides lead trips for all ability levels, from first-time climbers to seasoned adventurers looking to tackle Zion's famous sandstone walls.\n\nOfferings include half-day and full-day canyoneering trips, rock climbing courses, and private guiding. All technical gear is provided, and guides focus on skill-building and safety throughout every excursion.\n\nWith decades of combined experience in Zion's backcountry, the team at Zion Rock & Mountain Guides knows these canyons better than anyone. They are passionate about sharing the beauty and challenge of Zion's vertical world.",
    city: "Springdale",
    state: "UT",
    address: "1458 Zion Park Blvd, Springdale, UT 84767",
    category_id: 22,
    location_id: 1,
    phone: "(435) 772-3303",
    email: "info@zionrockguides.com",
    website: "https://zionrockguides.com",
    price_range: "$$$",
    avg_rating: 4.8,
    review_count: 187,
    is_featured: false,
    view_count: 410,
  },
  {
    id: "e3",
    type: "experiences",
    name: "Zion Outfitter",
    slug: "zion-outfitter",
    tagline: "Gear rental for Narrows and canyoneering",
    description: "Zion Outfitter is the go-to gear rental shop for anyone tackling The Narrows or venturing into Zion's slot canyons. Located right at the park entrance in Springdale, they make it easy to get fully equipped before your adventure.\n\nRental packages include waterproof boots, neoprene socks, dry pants, and hiking poles for The Narrows, as well as full canyoneering kits with harnesses, ropes, and helmets. Knowledgeable staff help you choose the right gear for conditions.\n\nWith quick, efficient service and competitive pricing, Zion Outfitter has outfitted hundreds of thousands of hikers over the years. Reservations are recommended during peak season.",
    city: "Springdale",
    state: "UT",
    address: "7 Zion Park Blvd, Springdale, UT 84767",
    category_id: 21,
    location_id: 1,
    phone: "(435) 772-5090",
    email: "info@zionoutfitter.com",
    website: "https://zionoutfitter.com",
    price_range: "$",
    avg_rating: 4.5,
    review_count: 445,
    is_featured: false,
    view_count: 780,
  },
  {
    id: "e4",
    type: "experiences",
    name: "Canyon Trail Rides",
    slug: "canyon-trail-rides",
    tagline: "Horseback rides through Sand Bench Trail",
    description: "Canyon Trail Rides offers guided horseback riding excursions within Zion National Park along the scenic Sand Bench Trail. Riders enjoy stunning views of the canyon floor, the Virgin River, and the towering Watchman formation.\n\nTrips are available as one-hour or half-day rides and are suitable for riders of all experience levels. Friendly, experienced wranglers guide each trip and share stories about Zion's history, geology, and wildlife.\n\nThis is one of the only ways to experience Zion on horseback, and it provides a unique perspective that most visitors never get. It is a memorable activity for families, couples, and anyone who loves horses.",
    city: "Springdale",
    state: "UT",
    address: "Zion Lodge, Zion National Park, UT",
    category_id: 23,
    location_id: 1,
    phone: "(435) 679-8665",
    website: "https://canyonrides.com",
    price_range: "$$",
    avg_rating: 4.6,
    review_count: 98,
    is_featured: false,
    view_count: 210,
  },
  {
    id: "e5",
    type: "experiences",
    name: "Zion Photo Tours",
    slug: "zion-photo-tours",
    tagline: "Capture stunning landscapes with a pro guide",
    description: "Zion Photo Tours pairs visitors with professional photographers who know Zion's best locations, lighting conditions, and hidden compositions. Whether you shoot with a DSLR or a smartphone, their guides help you capture frame-worthy images.\n\nTours are offered at sunrise, sunset, and during the golden hour for optimal lighting. Options range from half-day workshops to multi-day photo excursions covering both popular and off-the-beaten-path locations.\n\nNo prior photography experience is required. Guides tailor instruction to your skill level and interests, making this a rewarding experience for beginners and advanced photographers alike.",
    city: "Springdale",
    state: "UT",
    address: "Springdale, UT 84767",
    category_id: 24,
    location_id: 1,
    phone: "(435) 772-1001",
    email: "info@zionphototours.com",
    website: "https://zionphototours.com",
    price_range: "$$$",
    avg_rating: 4.7,
    review_count: 64,
    is_featured: false,
    view_count: 155,
  },
  {
    id: "e6",
    type: "experiences",
    name: "Zion Adventure Company",
    slug: "zion-adventure-company",
    tagline: "Canyoneering, climbing, and river trips",
    description: "Zion Adventure Company is a full-service outdoor outfitter offering guided canyoneering, rock climbing, river tubing, and hiking trips throughout the Zion area. They have been introducing visitors to the park's hidden wonders for over 25 years.\n\nTheir guided canyoneering trips explore Zion's most spectacular slot canyons, with options for beginners and experienced adventurers. The company also rents gear for independent trips to The Narrows and other popular routes.\n\nWith a friendly, knowledgeable staff and a deep commitment to safety and conservation, Zion Adventure Company is one of Springdale's most trusted adventure outfitters.",
    city: "Springdale",
    state: "UT",
    address: "36 Lion Blvd, Springdale, UT 84767",
    category_id: 20,
    location_id: 1,
    phone: "(435) 772-1001",
    email: "info@zionadventures.com",
    website: "https://zionadventures.com",
    price_range: "$$",
    avg_rating: 4.8,
    review_count: 276,
    is_featured: false,
    view_count: 530,
  },
  // ---- Hiking (7) ----
  {
    id: "h1",
    type: "hiking",
    name: "Angels Landing",
    slug: "angels-landing",
    tagline: "Zion's most iconic and thrilling trail",
    description: angelsLandingDescription,
    city: "Zion National Park",
    state: "UT",
    address: "Grotto Trailhead, Zion National Park, UT",
    category_id: 30,
    location_id: 7,
    avg_rating: 4.9,
    review_count: 1847,
    is_featured: true,
    view_count: 5200,
  },
  {
    id: "h2",
    type: "hiking",
    name: "The Narrows",
    slug: "the-narrows",
    tagline: "Wade through the Virgin River in a slot canyon",
    description: "The Narrows is one of the most extraordinary hikes in the world, following the North Fork of the Virgin River through a stunning slot canyon with walls rising up to 1,000 feet on either side. Much of the hike is spent wading through the river itself.\n\nThe bottom-up day hike begins at the Temple of Sinawava shuttle stop and continues upstream as far as you wish, with most hikers going 3 to 5 miles in. Water depth varies from ankle-deep to waist-deep depending on the season and flow levels.\n\nProper footwear and gear are essential. Waterproof boots, neoprene socks, and a hiking pole are highly recommended and can be rented in Springdale. Check the flash flood forecast before heading out, as the canyon can be dangerous during storms.",
    city: "Zion National Park",
    state: "UT",
    address: "Temple of Sinawava, Zion National Park, UT",
    category_id: 31,
    location_id: 7,
    avg_rating: 4.8,
    review_count: 2103,
    is_featured: true,
    view_count: 4800,
  },
  {
    id: "h3",
    type: "hiking",
    name: "Observation Point",
    slug: "observation-point",
    tagline: "The highest overlook in Zion Canyon",
    description: "Observation Point offers the highest vantage point in Zion Canyon, standing 2,148 feet above the valley floor. The panoramic views from the summit are arguably the best in the park, looking down on Angels Landing and across the entire canyon.\n\nThe main trail via the East Mesa Trail is a moderate 7-mile round trip that starts outside the park near Zion Ponderosa Ranch. The original Observation Point Trail from Weeping Rock is currently closed due to rockfall.\n\nThe East Mesa route is relatively flat and passes through ponderosa pine forest before opening up to the dramatic canyon rim overlook. It is a fantastic alternative to Angels Landing for hikers who want top-tier views without the exposure.",
    city: "Zion National Park",
    state: "UT",
    address: "East Mesa Trailhead, Zion National Park, UT",
    category_id: 30,
    location_id: 7,
    avg_rating: 4.7,
    review_count: 834,
    is_featured: false,
    view_count: 2100,
  },
  {
    id: "h4",
    type: "hiking",
    name: "Emerald Pools Trail",
    slug: "emerald-pools",
    tagline: "Family-friendly waterfalls and pools",
    description: "The Emerald Pools Trail system offers a family-friendly network of paths leading to a series of beautiful waterfalls and pools set against a dramatic sandstone backdrop. The Lower Emerald Pool is an easy, paved 1.2-mile round trip that is accessible to most visitors.\n\nThe Middle and Upper Emerald Pools add more distance and elevation but reward hikers with increasingly impressive scenery, including a hanging garden and a natural amphitheater with seasonal waterfalls.\n\nThis trail is one of the most popular in Zion and can be combined with other canyon-floor hikes for a full day of exploration. It is an excellent choice for families with young children or visitors looking for a less strenuous outing.",
    city: "Zion National Park",
    state: "UT",
    address: "Zion Lodge Trailhead, Zion National Park, UT",
    category_id: 30,
    location_id: 7,
    avg_rating: 4.3,
    review_count: 1256,
    is_featured: false,
    view_count: 3500,
  },
  {
    id: "h5",
    type: "hiking",
    name: "Canyon Overlook Trail",
    slug: "canyon-overlook",
    tagline: "Short hike with a spectacular payoff",
    description: "The Canyon Overlook Trail is a short but rewarding 1-mile round trip hike that ends at a stunning viewpoint overlooking Pine Creek Canyon and the lower switchbacks of the Zion-Mount Carmel Highway. The trailhead is located just east of the long tunnel.\n\nThe trail features carved rock steps, a narrow ledge, and a short wooden bridge as it winds along the cliff edge. Despite its short length, the dramatic scenery makes it one of the most photographed spots in the park.\n\nNo shuttle is needed to access this trail, making it a convenient option for visitors entering or exiting the park from the east. It is perfect for those short on time who still want a memorable Zion experience.",
    city: "Zion National Park",
    state: "UT",
    address: "Zion-Mount Carmel Highway, Zion National Park, UT",
    category_id: 32,
    location_id: 7,
    avg_rating: 4.6,
    review_count: 967,
    is_featured: false,
    view_count: 2800,
  },
  {
    id: "h6",
    type: "hiking",
    name: "West Rim Trail",
    slug: "west-rim-trail",
    tagline: "Multi-day backpacking through Zion's high country",
    description: "The West Rim Trail is a stunning 14.2-mile point-to-point route that traverses the high plateaus above Zion Canyon before descending via the famous switchbacks past Angels Landing to the Grotto trailhead below.\n\nBackpackers typically complete the trail in two days, camping at one of the designated backcountry sites along the way. The trail offers sweeping views of Horse Pasture Plateau, Phantom Valley, and deep into the heart of Zion Canyon.\n\nA wilderness permit is required for overnight trips and can be obtained from the Zion Wilderness Desk. Water sources are limited, so careful planning is essential. This is a world-class backpacking route for experienced hikers.",
    city: "Zion National Park",
    state: "UT",
    address: "Lava Point Trailhead, Zion National Park, UT",
    category_id: 33,
    location_id: 7,
    avg_rating: 4.8,
    review_count: 342,
    is_featured: false,
    view_count: 890,
  },
  {
    id: "h7",
    type: "hiking",
    name: "Pa'rus Trail",
    slug: "parus-trail",
    tagline: "Paved riverside path perfect for all ages",
    description: "The Pa'rus Trail is a paved, flat, 3.5-mile round trip path that follows the Virgin River from the Zion Canyon Visitor Center to the Canyon Junction. It is the only trail in Zion that allows bicycles and pets.\n\nThe trail offers gentle river views, wildflowers in spring, and stunning perspectives of the Watchman, West Temple, and other iconic formations. It is fully accessible and perfect for families with strollers, wheelchairs, and visitors of all fitness levels.\n\nPa'rus Trail is an ideal early morning or evening walk when the light paints the canyon walls in warm tones. It provides a peaceful contrast to the more strenuous trails deeper in the canyon.",
    city: "Zion National Park",
    state: "UT",
    address: "Zion Canyon Visitor Center, Zion National Park, UT",
    category_id: 30,
    location_id: 7,
    avg_rating: 4.2,
    review_count: 678,
    is_featured: false,
    view_count: 1900,
  },
  // ---- Transportation (6) ----
  {
    id: "t1",
    type: "transportation",
    name: "Zion Canyon Shuttle",
    slug: "zion-canyon-shuttle",
    tagline: "Free park shuttle running March through November",
    description: "The Zion Canyon Shuttle is a free, propane-powered shuttle system that operates within Zion National Park from March through November. During shuttle season, private vehicles are not allowed on the Zion Canyon Scenic Drive.\n\nThe shuttle makes nine stops along the canyon floor, providing access to all major trailheads including the Grotto (Angels Landing), Zion Lodge (Emerald Pools), and Temple of Sinawava (The Narrows). Shuttles run frequently, typically every 7 to 10 minutes during peak hours.\n\nThe shuttle is the primary way to access Zion Canyon during the busy season. Board at the Zion Canyon Visitor Center and enjoy the scenic ride through the canyon without the stress of finding parking.",
    city: "Zion National Park",
    state: "UT",
    address: "Zion Canyon Visitor Center, Zion National Park, UT",
    category_id: 40,
    location_id: 7,
    phone: "(435) 772-3256",
    website: "https://nps.gov/zion",
    price_range: "$",
    avg_rating: 4.1,
    review_count: 567,
    is_featured: true,
    view_count: 1200,
  },
  {
    id: "t2",
    type: "transportation",
    name: "St. George Shuttle",
    slug: "st-george-shuttle",
    tagline: "Daily shuttle from St. George to Springdale",
    description: "The St. George Shuttle provides daily transportation between St. George, Utah, and Springdale, the gateway town to Zion National Park. This is a convenient option for visitors flying into St. George Regional Airport.\n\nThe shuttle operates multiple departures throughout the day with comfortable seating and luggage storage. The scenic drive takes approximately one hour and passes through the beautiful red rock landscapes of southern Utah.\n\nReservations can be made online or by phone. The service is popular during peak season, so booking in advance is recommended. It eliminates the need for a rental car if you plan to use the park shuttle system.",
    city: "St. George",
    state: "UT",
    address: "St. George, UT",
    category_id: 40,
    location_id: 5,
    phone: "(435) 628-8320",
    website: "https://stgeorgeshuttle.com",
    price_range: "$$",
    avg_rating: 4.4,
    review_count: 89,
    is_featured: false,
    view_count: 340,
  },
  {
    id: "t3",
    type: "transportation",
    name: "Zion Cycles",
    slug: "zion-cycles",
    tagline: "E-bike and mountain bike rentals in Springdale",
    description: "Zion Cycles offers a full range of e-bike and mountain bike rentals in Springdale. Their fleet includes high-quality pedal-assist e-bikes, hybrid bikes, and mountain bikes suitable for riders of all skill levels.\n\nPopular routes include the Pa'rus Trail inside the park, the Springdale Parallel Trail, and the scenic roads through Rockville and Virgin. Staff provide route maps, trail recommendations, and helmet fittings with every rental.\n\nHourly, half-day, and full-day rental options are available at competitive rates. Zion Cycles is the perfect way to explore the area at your own pace while getting some exercise and fresh air.",
    city: "Springdale",
    state: "UT",
    address: "868 Zion Park Blvd, Springdale, UT 84767",
    category_id: 42,
    location_id: 1,
    phone: "(435) 772-0400",
    email: "info@zioncycles.com",
    website: "https://zioncycles.com",
    price_range: "$$",
    avg_rating: 4.6,
    review_count: 134,
    is_featured: false,
    view_count: 280,
  },
  {
    id: "t4",
    type: "transportation",
    name: "Enterprise Rent-A-Car",
    slug: "enterprise-st-george",
    tagline: "Full-service car rental in St. George",
    description: "Enterprise Rent-A-Car in St. George provides a full fleet of vehicles for visitors heading to Zion National Park and the surrounding area. From compact cars to SUVs, they have options to fit every budget and group size.\n\nThe St. George location offers convenient pickup and drop-off, and their staff can provide driving directions and tips for navigating the roads to Zion. Having a rental car gives you the flexibility to explore beyond the park at your own pace.\n\nEnterprise is a reliable choice for visitors flying into St. George Regional Airport or Las Vegas who want the freedom to set their own schedule and explore southern Utah's many scenic attractions.",
    city: "St. George",
    state: "UT",
    address: "652 E St George Blvd, St. George, UT 84770",
    category_id: 41,
    location_id: 5,
    phone: "(435) 634-1432",
    website: "https://enterprise.com",
    price_range: "$$",
    avg_rating: 4.0,
    review_count: 45,
    is_featured: false,
    view_count: 160,
  },
  {
    id: "t5",
    type: "transportation",
    name: "Red Rock Shuttle",
    slug: "red-rock-shuttle",
    tagline: "Private and group shuttles to trailheads",
    description: "Red Rock Shuttle offers private and small-group shuttle services throughout the Zion area. They specialize in trailhead drop-offs and pickups for point-to-point hikes like the West Rim Trail, Narrows top-down, and the Subway.\n\nTheir fleet of comfortable vans accommodates individuals, families, and groups. Drivers are knowledgeable about the area and can provide helpful tips about trail conditions, weather, and local attractions.\n\nAdvance reservations are required. Red Rock Shuttle is an invaluable service for hikers tackling Zion's most iconic through-hikes, eliminating the car shuttle logistics that can complicate backcountry trips.",
    city: "Springdale",
    state: "UT",
    address: "Springdale, UT 84767",
    category_id: 40,
    location_id: 1,
    phone: "(435) 635-9104",
    email: "info@redrockshuttle.com",
    website: "https://redrockshuttle.com",
    price_range: "$$$",
    avg_rating: 4.7,
    review_count: 56,
    is_featured: false,
    view_count: 145,
  },
  {
    id: "t6",
    type: "transportation",
    name: "Las Vegas to Zion Shuttle",
    slug: "vegas-zion-shuttle",
    tagline: "Direct service from the Strip to Springdale",
    description: "The Las Vegas to Zion Shuttle provides direct daily service from the Las Vegas Strip to Springdale, the gateway town to Zion National Park. The ride takes approximately 2.5 hours and passes through the stunning scenery of the Virgin River Gorge.\n\nThe shuttle offers comfortable seating, onboard WiFi, and luggage storage. Multiple departure times are available daily in both directions, making it easy to plan your trip around your schedule.\n\nThis shuttle service is ideal for visitors flying into Las Vegas who do not want to rent a car. Combined with the free Zion Canyon Shuttle, it provides a car-free way to experience one of America's most spectacular national parks.",
    city: "Springdale",
    state: "UT",
    address: "Springdale, UT 84767",
    category_id: 40,
    location_id: 1,
    phone: "(702) 944-8000",
    website: "https://vegastozion.com",
    price_range: "$$",
    avg_rating: 4.3,
    review_count: 178,
    is_featured: false,
    view_count: 410,
  },
];

const listingAmenities = [
  // Oscar's Cafe (d1)
  { listing_id: "d1", amenity_id: 1 },
  { listing_id: "d1", amenity_id: 2 },
  { listing_id: "d1", amenity_id: 3 },
  { listing_id: "d1", amenity_id: 4 },
  { listing_id: "d1", amenity_id: 5 },
  { listing_id: "d1", amenity_id: 6 },
  { listing_id: "d1", amenity_id: 7 },
  { listing_id: "d1", amenity_id: 8 },
  // Angels Landing (h1)
  { listing_id: "h1", amenity_id: 10 },
  { listing_id: "h1", amenity_id: 11 },
  { listing_id: "h1", amenity_id: 12 },
];

const businessHours = [
  { listing_id: "d1", day: "monday", open_time: "7:00 AM", close_time: "9:00 PM", is_closed: false },
  { listing_id: "d1", day: "tuesday", open_time: "7:00 AM", close_time: "9:00 PM", is_closed: false },
  { listing_id: "d1", day: "wednesday", open_time: "7:00 AM", close_time: "9:00 PM", is_closed: false },
  { listing_id: "d1", day: "thursday", open_time: "7:00 AM", close_time: "9:00 PM", is_closed: false },
  { listing_id: "d1", day: "friday", open_time: "7:00 AM", close_time: "10:00 PM", is_closed: false },
  { listing_id: "d1", day: "saturday", open_time: "7:00 AM", close_time: "10:00 PM", is_closed: false },
  { listing_id: "d1", day: "sunday", open_time: "8:00 AM", close_time: "9:00 PM", is_closed: false },
];

const hikingDetailsData = [
  {
    listing_id: "h1",
    difficulty: "hard",
    trail_type: "out_and_back",
    distance_miles: 5.4,
    distance_miles_max: null,
    elevation_gain_ft: 1488,
    estimated_time: "3-5 hours",
    entry_requirement: "permit",
    permit_info: "Lottery permit required via recreation.gov for the chain section.",
    dog_policy: "not_allowed",
    kid_friendly: false,
    season_start: "March",
    season_end: "November",
    water_available: false,
    shade_level: "Minimal",
  },
];

const reviews = [
  {
    listing_id: "d1",
    user_name: "Sarah M.",
    rating: 5,
    title: "Amazing breakfast spot",
    body: "We stopped here on our way into the park and were blown away. The huevos rancheros were incredible, and the patio has gorgeous views of the canyon walls. Service was fast and friendly. Will definitely return.",
    status: "approved",
    created_at: "2024-09-15",
  },
  {
    listing_id: "d1",
    user_name: "James K.",
    rating: 4,
    title: "Great food, worth the wait",
    body: "The food quality is top-notch. We had the burger and the fish tacos, both excellent. There was a 20-minute wait for a table during peak lunch, but the patio seating made it worth it. Good portions for the price.",
    status: "approved",
    created_at: "2024-08-22",
  },
  {
    listing_id: "d1",
    user_name: "Emily R.",
    rating: 5,
    title: "A Springdale must-visit",
    body: "This is our go-to spot every time we visit Zion. Consistently great food, friendly staff, and a wonderful atmosphere. The outdoor seating is perfect on a warm evening.",
    status: "approved",
    created_at: "2024-07-10",
  },
  {
    listing_id: "d1",
    user_name: "David L.",
    rating: 4,
    title: "Solid choice near the park",
    body: "Good variety on the menu with options for everyone. The portions are generous and the prices are reasonable for a tourist area. The patio has a really nice vibe in the evening.",
    status: "approved",
    created_at: "2024-06-05",
  },
];

const blogCategories = [
  {
    name: "Trip Planning",
    slug: "trip-planning",
    description:
      "Essential guides for planning your Zion visit, from park logistics and transportation to seasonal travel advice.",
    meta_title: "Zion Trip Planning Guides & Travel Tips",
    meta_description:
      "Plan your Zion National Park trip with local guides on fees, transportation, timing, and practical travel tips.",
  },
  {
    name: "Hiking",
    slug: "hiking",
    description:
      "Trail guides, seasonal hiking strategies, and practical tips for safely exploring Zion's canyon trails.",
    meta_title: "Zion Hiking Guides, Trail Tips & Route Planning",
    meta_description:
      "Explore Zion hiking guides with trail breakdowns, safety tips, seasonal conditions, and route planning advice.",
  },
];

const blogPosts = [
  {
    title: "Top 5 Spring Hikes in Zion National Park for Stunning Wildflower Views",
    slug: "top-5-spring-hikes-in-zion-national-park-for-stunning-wildflower-views",
    excerpt: "Discover the best trails for catching Zion's spectacular spring wildflower season, from easy walks to challenging canyon routes.",
    author: "Zion Travel Team",
    category: "Hiking",
    category_slug: "hiking",
    read_time: "8 min read",
    status: "published",
    published_at: "2023-05-01",
    content: "Spring in Zion National Park transforms the red rock landscape into a vibrant canvas of color. As temperatures warm and snowmelt feeds the Virgin River, wildflowers burst to life along canyon floors and mesa tops, offering hikers a spectacular seasonal display that rivals the geological scenery itself.",
  },
  {
    title: "Top Zion National Park Hikes: Best Trails for Every Adventurer",
    slug: "top-zion-national-park-hikes-best-trails-for-every-adventurer",
    excerpt: "From the iconic Angels Landing to family-friendly riverside walks, find the perfect trail for your skill level.",
    author: "Zion Travel Team",
    category: "Hiking",
    category_slug: "hiking",
    read_time: "10 min read",
    status: "published",
    published_at: "2023-04-01",
    content: "Zion National Park is home to some of the most dramatic hiking trails in the American Southwest. Whether you are a seasoned backpacker looking for a multi-day adventure or a family seeking a gentle stroll along the river, there is a trail perfectly suited to your abilities and interests.",
  },
  {
    title: "Understanding Entrance Fees and Additional Expenses at Zion National Park",
    slug: "understanding-entrance-fees-and-additional-expenses-at-zion-national-park",
    excerpt: "Everything you need to know about park passes, shuttle fees, and budgeting for your Zion trip.",
    author: "Zion Travel Team",
    category: "Trip Planning",
    category_slug: "trip-planning",
    read_time: "6 min read",
    status: "published",
    published_at: "2023-03-01",
    content: "Planning a trip to Zion National Park involves more than just packing your hiking boots. Understanding the costs associated with your visit, from entrance fees and shuttle logistics to gear rentals and dining, will help you budget wisely and avoid surprises.",
  },
  {
    title: "The Best Time of Year to Visit Zion National Park",
    slug: "the-best-time-of-year-to-visit-zion-national-park",
    excerpt: "A month-by-month guide to weather, crowds, and seasonal highlights to help you plan the perfect visit.",
    author: "Zion Travel Team",
    category: "Trip Planning",
    category_slug: "trip-planning",
    read_time: "7 min read",
    status: "published",
    published_at: "2023-02-01",
    content: "Zion National Park welcomes over four million visitors annually, and choosing the right time to visit can make the difference between a crowded, sweltering experience and a serene, comfortable adventure. Each season brings its own unique beauty, weather patterns, and crowd levels.",
  },
  {
    title: "How to Get to Zion National Park: Airports and Transportation Options",
    slug: "how-to-get-to-zion-national-park-airports-and-transportation-options",
    excerpt: "Complete guide to reaching Zion from Las Vegas, Salt Lake City, and St. George airports.",
    author: "Zion Travel Team",
    category: "Trip Planning",
    category_slug: "trip-planning",
    read_time: "7 min read",
    status: "published",
    published_at: "2023-01-15",
    content: "Getting to Zion National Park is easier than you might think. Located in southwestern Utah, the park is accessible from several major airports, with Las Vegas being the most popular starting point for visitors from outside the region.",
  },
];

const settings = [
  { key: "site_title", value: "ZION TRAVEL" },
  { key: "tagline", value: "Your Guide to Zion National Park" },
  { key: "admin_email", value: "info@zion.travel" },
  { key: "timezone", value: "America/Denver" },
  { key: "title_template", value: "%page_title% | ZION TRAVEL" },
  { key: "meta_description", value: "Plan your trip to Zion National Park. Discover the best dining, lodging, experiences, hiking trails, and transportation." },
  { key: "allow_indexing", value: "true" },
  { key: "instagram", value: "" },
  { key: "facebook", value: "" },
  { key: "contact_email", value: "info@zion.travel" },
  { key: "contact_phone", value: "(435) 555-0100" },
  { key: "contact_address", value: "Springdale, UT 84767" },
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------
async function seed() {
  const counts = {};

  // --------------------------------------------------
  // 1. Truncate all tables
  // --------------------------------------------------
  console.log("Truncating all tables...");
  await sql.unsafe(`
    TRUNCATE
      settings,
      blog_categories,
      blog_posts,
      reviews,
      hiking_details,
      transportation_details,
      experience_details,
      lodging_details,
      dining_details,
      business_hours,
      listing_amenities,
      listings,
      amenities,
      categories,
      locations
    CASCADE
  `);
  console.log("  All tables truncated.\n");

  // --------------------------------------------------
  // 2. Locations
  // --------------------------------------------------
  console.log("Seeding locations...");
  for (const loc of locations) {
    await sql`
      INSERT INTO locations (id, name, slug)
      OVERRIDING SYSTEM VALUE
      VALUES (${loc.id}, ${loc.name}, ${loc.slug})
    `;
  }
  // Reset the sequence so future inserts get the right id
  await sql.unsafe(`SELECT setval(pg_get_serial_sequence('locations', 'id'), (SELECT MAX(id) FROM locations))`);
  counts.locations = locations.length;
  console.log(`  ${counts.locations} locations inserted.`);

  // --------------------------------------------------
  // 3. Categories
  // --------------------------------------------------
  console.log("Seeding categories...");
  for (const cat of categories) {
    await sql`
      INSERT INTO categories (id, name, slug, listing_type)
      OVERRIDING SYSTEM VALUE
      VALUES (${cat.id}, ${cat.name}, ${cat.slug}, ${cat.listing_type})
    `;
  }
  await sql.unsafe(`SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT MAX(id) FROM categories))`);
  counts.categories = categories.length;
  console.log(`  ${counts.categories} categories inserted.`);

  // --------------------------------------------------
  // 4. Amenities
  // --------------------------------------------------
  console.log("Seeding amenities...");
  for (const am of amenities) {
    await sql`
      INSERT INTO amenities (id, name, slug, icon)
      OVERRIDING SYSTEM VALUE
      VALUES (${am.id}, ${am.name}, ${am.slug}, ${am.icon})
    `;
  }
  await sql.unsafe(`SELECT setval(pg_get_serial_sequence('amenities', 'id'), (SELECT MAX(id) FROM amenities))`);
  counts.amenities = amenities.length;
  console.log(`  ${counts.amenities} amenities inserted.`);

  // --------------------------------------------------
  // 5. Listings
  // --------------------------------------------------
  console.log("Seeding listings...");
  for (const l of listings) {
    await sql`
      INSERT INTO listings (
        id, type, name, slug, tagline, description,
        category_id, location_id,
        address, city, state,
        phone, email, website,
        price_range, avg_rating, review_count,
        is_featured, view_count, status
      ) VALUES (
        ${l.id}, ${l.type}, ${l.name}, ${l.slug}, ${l.tagline}, ${l.description},
        ${l.category_id}, ${l.location_id},
        ${l.address || null}, ${l.city}, ${l.state || "UT"},
        ${l.phone || null}, ${l.email || null}, ${l.website || null},
        ${l.price_range || null}, ${l.avg_rating || 0}, ${l.review_count || 0},
        ${l.is_featured || false}, ${l.view_count || 0}, 'published'
      )
    `;
  }
  counts.listings = listings.length;
  console.log(`  ${counts.listings} listings inserted.`);

  // --------------------------------------------------
  // 6. Listing Amenities
  // --------------------------------------------------
  console.log("Seeding listing_amenities...");
  for (const la of listingAmenities) {
    await sql`
      INSERT INTO listing_amenities (listing_id, amenity_id)
      VALUES (${la.listing_id}, ${la.amenity_id})
    `;
  }
  counts.listing_amenities = listingAmenities.length;
  console.log(`  ${counts.listing_amenities} listing_amenities inserted.`);

  // --------------------------------------------------
  // 7. Business Hours
  // --------------------------------------------------
  console.log("Seeding business_hours...");
  for (const bh of businessHours) {
    await sql`
      INSERT INTO business_hours (listing_id, day, open_time, close_time, is_closed)
      VALUES (${bh.listing_id}, ${bh.day}, ${bh.open_time}, ${bh.close_time}, ${bh.is_closed})
    `;
  }
  counts.business_hours = businessHours.length;
  console.log(`  ${counts.business_hours} business_hours inserted.`);

  // --------------------------------------------------
  // 8. Dining Details (for dining listings - basic info)
  // --------------------------------------------------
  console.log("Seeding dining_details...");
  const diningListings = listings.filter((l) => l.type === "dining");
  for (const dl of diningListings) {
    await sql`
      INSERT INTO dining_details (listing_id, cuisine_type, serves_alcohol, outdoor_seating, reservations_accepted, takeout_available)
      VALUES (
        ${dl.id},
        ${dl.category_id === 2 ? "Mexican" : dl.category_id === 3 ? "Pizza" : dl.category_id === 4 ? "Cafe" : dl.category_id === 5 ? "Fine Dining" : "American"},
        ${dl.id === "d4" ? false : true},
        ${true},
        ${dl.price_range === "$$$" || dl.price_range === "$$$$"},
        ${true}
      )
    `;
  }
  counts.dining_details = diningListings.length;
  console.log(`  ${counts.dining_details} dining_details inserted.`);

  // --------------------------------------------------
  // 9. Lodging Details
  // --------------------------------------------------
  console.log("Seeding lodging_details...");
  const lodgingListings = listings.filter((l) => l.type === "lodging");
  const lodgingTypeMap = {
    l1: "hotel",
    l2: "glamping",
    l3: "hotel",
    l4: "vacation_rental",
    l5: "campground",
    l6: "inn",
  };
  for (const ll of lodgingListings) {
    await sql`
      INSERT INTO lodging_details (listing_id, lodging_type, pet_friendly)
      VALUES (
        ${ll.id},
        ${lodgingTypeMap[ll.id] || "hotel"},
        ${ll.id === "l5" || ll.id === "l6" ? false : true}
      )
    `;
  }
  counts.lodging_details = lodgingListings.length;
  console.log(`  ${counts.lodging_details} lodging_details inserted.`);

  // --------------------------------------------------
  // 10. Experience Details
  // --------------------------------------------------
  console.log("Seeding experience_details...");
  const expListings = listings.filter((l) => l.type === "experiences");
  const expTypeMap = {
    e1: "tour_operator",
    e2: "guide_service",
    e3: "rental",
    e4: "tour_operator",
    e5: "tour_operator",
    e6: "adventure",
  };
  for (const el of expListings) {
    await sql`
      INSERT INTO experience_details (listing_id, experience_type, gear_provided)
      VALUES (
        ${el.id},
        ${expTypeMap[el.id] || "tour_operator"},
        ${el.id !== "e3"}
      )
    `;
  }
  counts.experience_details = expListings.length;
  console.log(`  ${counts.experience_details} experience_details inserted.`);

  // --------------------------------------------------
  // 11. Hiking Details
  // --------------------------------------------------
  console.log("Seeding hiking_details...");
  for (const hd of hikingDetailsData) {
    await sql`
      INSERT INTO hiking_details (
        listing_id, difficulty, trail_type, distance_miles, elevation_gain_ft,
        estimated_time, permit_required, permit_info, dogs_allowed, kid_friendly,
        season_start, season_end, water_available, shade_level
      ) VALUES (
        ${hd.listing_id}, ${hd.difficulty}, ${hd.trail_type}, ${hd.distance_miles}, ${hd.elevation_gain_ft},
        ${hd.estimated_time}, ${hd.permit_required}, ${hd.permit_info}, ${hd.dogs_allowed}, ${hd.kid_friendly},
        ${hd.season_start}, ${hd.season_end}, ${hd.water_available}, ${hd.shade_level}
      )
    `;
  }
  counts.hiking_details = hikingDetailsData.length;
  console.log(`  ${counts.hiking_details} hiking_details inserted.`);

  // --------------------------------------------------
  // 12. Transportation Details
  // --------------------------------------------------
  console.log("Seeding transportation_details...");
  const transListings = listings.filter((l) => l.type === "transportation");
  const transTypeMap = {
    t1: "shuttle",
    t2: "shuttle",
    t3: "bike_rental",
    t4: "rental_car",
    t5: "shuttle",
    t6: "shuttle",
  };
  for (const tl of transListings) {
    await sql`
      INSERT INTO transportation_details (listing_id, transport_type, operates_seasonally, season_start, season_end)
      VALUES (
        ${tl.id},
        ${transTypeMap[tl.id] || "shuttle"},
        ${tl.id === "t1"},
        ${tl.id === "t1" ? "March" : null},
        ${tl.id === "t1" ? "November" : null}
      )
    `;
  }
  counts.transportation_details = transListings.length;
  console.log(`  ${counts.transportation_details} transportation_details inserted.`);

  // --------------------------------------------------
  // 13. Reviews
  // --------------------------------------------------
  console.log("Seeding reviews...");
  for (const r of reviews) {
    await sql`
      INSERT INTO reviews (listing_id, user_name, rating, title, body, status, created_at)
      VALUES (${r.listing_id}, ${r.user_name}, ${r.rating}, ${r.title}, ${r.body}, ${r.status}, ${r.created_at})
    `;
  }
  counts.reviews = reviews.length;
  console.log(`  ${counts.reviews} reviews inserted.`);

  // --------------------------------------------------
  // 14. Blog Categories
  // --------------------------------------------------
  console.log("Seeding blog_categories...");
  const blogCategoryIdBySlug = new Map();
  for (const category of blogCategories) {
    const [row] = await sql`
      INSERT INTO blog_categories (name, slug, description, meta_title, meta_description)
      VALUES (${category.name}, ${category.slug}, ${category.description}, ${category.meta_title}, ${category.meta_description})
      RETURNING id, slug
    `;
    blogCategoryIdBySlug.set(row.slug, row.id);
  }
  counts.blog_categories = blogCategories.length;
  console.log(`  ${counts.blog_categories} blog_categories inserted.`);

  // --------------------------------------------------
  // 15. Blog Posts
  // --------------------------------------------------
  console.log("Seeding blog_posts...");
  for (const bp of blogPosts) {
    await sql`
      INSERT INTO blog_posts (
        title,
        slug,
        excerpt,
        content,
        author,
        category_id,
        category,
        category_slug,
        read_time,
        status,
        published_at
      )
      VALUES (
        ${bp.title},
        ${bp.slug},
        ${bp.excerpt},
        ${bp.content},
        ${bp.author},
        ${blogCategoryIdBySlug.get(bp.category_slug) || null},
        ${bp.category},
        ${bp.category_slug},
        ${bp.read_time},
        ${bp.status},
        ${bp.published_at}
      )
    `;
  }
  counts.blog_posts = blogPosts.length;
  console.log(`  ${counts.blog_posts} blog_posts inserted.`);

  // --------------------------------------------------
  // 16. Settings
  // --------------------------------------------------
  console.log("Seeding settings...");
  for (const s of settings) {
    await sql`
      INSERT INTO settings (key, value)
      VALUES (${s.key}, ${s.value})
    `;
  }
  counts.settings = settings.length;
  console.log(`  ${counts.settings} settings inserted.`);

  // --------------------------------------------------
  // Summary
  // --------------------------------------------------
  console.log("\n========================================");
  console.log("  SEED COMPLETE");
  console.log("========================================");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count} rows`);
  }
  console.log("========================================\n");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
try {
  await seed();
} catch (err) {
  console.error("Seed failed:", err);
  process.exit(1);
} finally {
  await sql.end();
  console.log("Database connection closed.");
}
