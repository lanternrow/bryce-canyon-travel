import postgres from 'postgres';

const sql = postgres('postgresql://neondb_owner:npg_NLeYfn3Kqd1C@ep-dry-rice-akvotzdw.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require');

const missing = [
  {
    name: 'Settlers Point Luxury RV Resort',
    city: 'Hurricane',
    state: 'UT',
    address: '5000 W Old Hwy 91, Hurricane, UT 84737',
    phone: '',
    website: 'https://settlerspointluxuryrvresort.com/',
    description: 'Luxury RV resort near St. George and Zion National Park with pickleball courts, family playground, modern clubhouse, fenced dog park with agility course, and pet concierge services.',
  },
  {
    name: 'Zion National Park KOA Holiday',
    city: 'Virgin',
    state: 'UT',
    address: '372 W UT-9, Virgin, UT 84779',
    phone: '',
    website: 'https://koa.com/campgrounds/zion/',
    description: 'Brand-new campground offering large RV sites with KOA Patio upgrades, deluxe cabins with full baths, and convenient access to Zion National Park.',
  },
  {
    name: 'Jellystone Park Zion',
    city: 'Hurricane',
    state: 'UT',
    address: '4985 N Hwy 91, Hurricane, UT 84737',
    phone: '',
    website: 'https://zionutahjellystonepark.com/',
    description: 'Family camping and RV resort near St. George and Zion National Park featuring a water zone, themed activities, and resort-style amenities.',
  },
  {
    name: 'Zion Ponderosa Ranch Resort',
    city: 'Mount Carmel',
    state: 'UT',
    address: 'Twin Knolls Rd, Mount Carmel, UT 84755',
    phone: '(800) 293-5444',
    website: 'https://www.zionponderosa.com/',
    description: 'Full hook-up RV park just east of Zion National Park with big rig friendly pull-through sites, plus cabins, glamping, horseback riding, Jeep tours, and canyoneering.',
  },
  {
    name: 'Temple View RV Resort',
    city: 'St. George',
    state: 'UT',
    address: '975 S Main St, St. George, UT 84770',
    phone: '',
    website: 'https://www.templeviewrv.com/',
    description: 'Over 260 spacious full hook-up sites in St. George with swimming pool, jacuzzi, exercise room, and 45-minute drive to Zion National Park.',
  },
  {
    name: 'Southern Utah RV Resort',
    city: 'Washington',
    state: 'UT',
    address: '1400 N Coral Canyon Blvd, Washington, UT 84780',
    phone: '',
    website: 'https://www.southernutrv.com/',
    description: 'Premier RV resort near St. George between Zion National Park and Grand Canyon-Parashant National Monument, just off Interstate 15.',
  },
  {
    name: 'Mount Carmel Motel & RV Park',
    city: 'Mount Carmel',
    state: 'UT',
    address: '3010 S State St, Mount Carmel, UT 84755',
    phone: '',
    website: 'https://staynearzion.com/',
    description: 'Family-operated RV park along scenic Highway 89, just 20 minutes from Zion National Park with full hookup sites, WiFi, and clean facilities.',
  },
  {
    name: 'Hi-Road Basecamp',
    city: 'Mount Carmel',
    state: 'UT',
    address: 'US-89, Mount Carmel, UT 84755',
    phone: '',
    website: '',
    description: 'Gateway to Zion National Park eastern entrance offering RV sites, tent camping, and mountain cabins with a store and cafe on-site.',
  },
  {
    name: 'Bauers Canyon Ranch RV Park',
    city: 'Glendale',
    state: 'UT',
    address: '90 W Center St, Glendale, UT 84729',
    phone: '',
    website: '',
    description: 'Compact RV park in Glendale offering full hookups, tent sites with picnic tables and fire pits, between Zion and Bryce Canyon.',
  },
  {
    name: 'Kaibab Paiute RV Park & Campground',
    city: 'Fredonia',
    state: 'AZ',
    address: 'Pipe Spring Rd, Fredonia, AZ 86022',
    phone: '',
    website: '',
    description: 'Budget-friendly RV park on the Kaibab Paiute Indian Reservation with full hookups, convenient for day trips to Zion, Bryce Canyon, and Grand Canyon North Rim.',
  },
  {
    name: 'Coral Pink Sand Dunes Campground',
    city: 'Kanab',
    state: 'UT',
    address: 'Coral Pink Sand Dunes State Park, Kanab, UT 84741',
    phone: '',
    website: '',
    description: 'State park campground near Kanab with RV and tent sites set among stunning coral-colored sand dunes, close to Zion and Bryce Canyon.',
  },
  {
    name: 'Crazy Horse RV Resort',
    city: 'Kanab',
    state: 'UT',
    address: 'Kanab, UT',
    phone: '',
    website: '',
    description: 'RV resort in Kanab offering spacious sites with easy access to Zion National Park, Bryce Canyon, and Grand Staircase-Escalante.',
  },
  {
    name: 'Desert Canyons RV Resort',
    city: 'Hurricane',
    state: 'UT',
    address: 'Hurricane, UT',
    phone: '',
    website: '',
    description: 'Year-round RV resort in Hurricane with full amenities, convenient for visiting Zion National Park and Sand Hollow State Park.',
  },
];

function makeSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function run() {
  const existing = await sql`SELECT LOWER(name) as name FROM listings WHERE type = 'lodging'`;
  const existingNames = new Set(existing.map(r => r.name));

  const toInsert = missing.filter(m => !existingNames.has(m.name.toLowerCase()));

  console.log('Already exist (skipping):', missing.length - toInsert.length);
  console.log('Will insert:', toInsert.length);

  for (const m of toInsert) {
    const slug = makeSlug(m.name);
    await sql`
      INSERT INTO listings (name, slug, type, city, state, address, phone, website, description, status, created_at, updated_at)
      VALUES (${m.name}, ${slug}, 'lodging', ${m.city}, ${m.state}, ${m.address}, ${m.phone || null}, ${m.website || null}, ${m.description}, 'draft', NOW(), NOW())
      ON CONFLICT (type, slug) DO NOTHING
    `;
    console.log('  Inserted:', m.name, '(' + m.city + ', ' + m.state + ')');
  }

  console.log('\nDone!');
  await sql.end();
}

run().catch(e => { console.error(e); process.exit(1); });
