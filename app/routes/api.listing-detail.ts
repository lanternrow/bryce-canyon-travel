// API: GET /api/listings/:id
// Returns a single listing with full details

export async function loader({ params }: { params: { id: string } }) {
  const { id } = params;

  // Mock data for development — will be replaced with SQL queries
  const mockDetails: Record<string, any> = {
    "oscars-cafe": {
      id: "1",
      type: "dining",
      name: "Oscar's Cafe",
      slug: "oscars-cafe",
      tagline: "A Springdale institution since 1989",
      description: "Oscar's Cafe has been serving up generous portions of classic American and Southwestern fare to hungry hikers and travelers since 1989. Known for their massive breakfasts, fresh-squeezed lemonade, and friendly patio atmosphere, it's the perfect spot to fuel up before or after a day in the canyon.",
      category_name: "American Restaurant",
      location_name: "Springdale",
      address: "948 Zion Park Blvd",
      city: "Springdale",
      state: "UT",
      zip: "84767",
      lat: 37.1876,
      lng: -112.9985,
      phone: "435-772-3232",
      website: "https://www.oscarscafe.com",
      price_range: "$$",
      avg_rating: 4.5,
      review_count: 127,
      is_featured: true,
      status: "published",
      amenities: [
        { name: "Outdoor Seating", slug: "outdoor-seating", icon: "umbrella-beach" },
        { name: "Family Friendly", slug: "family-friendly", icon: "children" },
        { name: "Free Parking", slug: "free-parking", icon: "square-parking" },
        { name: "Takeout", slug: "takeout", icon: "bag-shopping" },
        { name: "Vegan Options", slug: "vegan-options", icon: "leaf" },
      ],
      business_hours: [
        { day: "monday", open_time: "07:00", close_time: "21:00", is_closed: false },
        { day: "tuesday", open_time: "07:00", close_time: "21:00", is_closed: false },
        { day: "wednesday", open_time: "07:00", close_time: "21:00", is_closed: false },
        { day: "thursday", open_time: "07:00", close_time: "21:00", is_closed: false },
        { day: "friday", open_time: "07:00", close_time: "22:00", is_closed: false },
        { day: "saturday", open_time: "07:00", close_time: "22:00", is_closed: false },
        { day: "sunday", open_time: "07:00", close_time: "21:00", is_closed: false },
      ],
      reviews: [
        { id: "r1", user_name: "Sarah M.", rating: 5, title: "Best breakfast in Springdale!", body: "We came here every morning during our 4-day trip. The huevos rancheros are amazing and the portions are huge. Great outdoor patio with canyon views.", created_at: "2024-10-15" },
        { id: "r2", user_name: "Mike T.", rating: 4, title: "Solid spot for hikers", body: "Good food, reasonable prices for a park town. Can get crowded during peak hours so plan accordingly.", created_at: "2024-09-22" },
        { id: "r3", user_name: "Jennifer L.", rating: 5, title: "A must-visit!", body: "The fresh-squeezed lemonade alone is worth the stop. Friendly staff and quick service even when busy.", created_at: "2024-08-10" },
      ],
    },
    "angels-landing": {
      id: "10",
      type: "hiking",
      name: "Angels Landing",
      slug: "angels-landing",
      tagline: "Zion's most iconic and thrilling trail",
      description: "Angels Landing is one of the most famous hikes in the world. The final half-mile follows a razor-thin ridge with chain handrails and sheer 1,000-foot drop-offs on both sides. The reward: a 360-degree panorama of Zion Canyon that will take your breath away.",
      category_name: "Hiking Trail",
      location_name: "Zion National Park",
      address: "The Grotto Trailhead",
      city: "Springdale",
      state: "UT",
      zip: "84767",
      lat: 37.2594,
      lng: -112.9508,
      avg_rating: 4.9,
      review_count: 1847,
      is_featured: true,
      status: "published",
      hiking_details: {
        difficulty: "hard",
        trail_type: "out_and_back",
        distance_miles: 5.4,
        distance_miles_max: null,
        elevation_gain_ft: 1488,
        estimated_time: "3-5 hours",
        entry_requirement: "permit",
        permit_info: "Day-use permits required via recreation.gov lottery. Seasonal permits available January through mid-November.",
        dog_policy: "not_allowed",
        kid_friendly: false,
        water_available: false,
        shade_level: "partial",
        season_start: "March",
        season_end: "November",
      },
      amenities: [
        { name: "Restrooms", slug: "restrooms", icon: "restroom" },
        { name: "Shuttle to Trailhead", slug: "shuttle-to-trailhead", icon: "bus" },
      ],
      reviews: [
        { id: "r1", user_name: "David K.", rating: 5, title: "Once-in-a-lifetime experience", body: "Nothing can prepare you for the final chain section. Terrifying and exhilarating in equal measure. The views from the top are unmatched anywhere in the park.", created_at: "2024-10-01" },
        { id: "r2", user_name: "Amanda R.", rating: 5, title: "Earned every step", body: "Start early to beat the crowds. We started at 6am and had the summit mostly to ourselves. Bring plenty of water and wear grippy shoes.", created_at: "2024-09-15" },
      ],
    },
  };

  // Try to find by ID or slug
  const listing = mockDetails[id] || mockDetails[params.id];

  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  return Response.json(listing);
}
