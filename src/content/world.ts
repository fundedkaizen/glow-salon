/**
 * Copied from glow-salon-docs/content/world.json (the design content). Decor sets (a full set gives its theme bonus), locations, seasons and events, marketing channels, packages. Prices are relative (1 = a basic facial's price) so the economy can scale them.
 * Edit the JSON there, then copy it here again, so the design and the game never drift.
 */
export const WORLD_DATA = {
 "decorSets": [
  {
   "id": "pastel-pop",
   "label": "Pastel Pop",
   "bonus": "+10% tips from students and teens",
   "items": [
    "candy sofa",
    "bubble lamp",
    "macaron shelf",
    "pastel rug",
    "heart mirror",
    "cloud neon"
   ]
  },
  {
   "id": "zen-garden",
   "label": "Zen Garden",
   "bonus": "massage and spa +1 star",
   "items": [
    "bamboo screen",
    "stone fountain",
    "bonsai",
    "tatami bench",
    "paper lantern",
    "sand garden"
   ]
  },
  {
   "id": "luxe-gold",
   "label": "Luxe Gold",
   "bonus": "VIPs visit twice as often",
   "items": [
    "velvet armchair",
    "gold mirror",
    "chandelier",
    "marble counter",
    "champagne cart",
    "gilded frame"
   ]
  },
  {
   "id": "tropical",
   "label": "Tropical",
   "bonus": "summer treatments +15% pay",
   "items": [
    "palm plant",
    "rattan chair",
    "surf sign",
    "hammock",
    "fruit bowl",
    "tiki lamp"
   ]
  },
  {
   "id": "retro-diner",
   "label": "Retro Diner",
   "bonus": "regulars come back sooner",
   "items": [
    "jukebox",
    "checker floor",
    "red booth",
    "neon clock",
    "milkshake counter",
    "vinyl wall"
   ]
  },
  {
   "id": "cottagecore",
   "label": "Cottagecore",
   "bonus": "grandmas and gardeners tip double",
   "items": [
    "floral armchair",
    "dried flower wreath",
    "wooden dresser",
    "lace curtains",
    "herb shelf",
    "teapot set"
   ]
  },
  {
   "id": "neon-night",
   "label": "Neon Night",
   "bonus": "late-day customers +20% tips",
   "items": [
    "neon sign",
    "led mirror",
    "glossy black chair",
    "holo rug",
    "arcade cabinet",
    "disco ball"
   ]
  }
 ],
 "locations": [
  {
   "id": "suburb",
   "label": "Maple Street",
   "clientele": [
    "grandma",
    "student",
    "office",
    "toddler-parent",
    "teacher",
    "gardener"
   ],
   "unlockDay": 0,
   "rent": 1
  },
  {
   "id": "downtown",
   "label": "Downtown",
   "clientele": [
    "office",
    "businessman",
    "lawyer",
    "gamer",
    "streamer",
    "chef"
   ],
   "unlockDay": 90,
   "rent": 2
  },
  {
   "id": "beach",
   "label": "Sunny Bay",
   "clientele": [
    "surfer",
    "athlete",
    "dancer",
    "hiker",
    "influencer"
   ],
   "unlockDay": 180,
   "rent": 2
  },
  {
   "id": "uptown",
   "label": "Uptown Luxe",
   "clientele": [
    "model",
    "lawyer",
    "pilot",
    "influencer",
    "royal",
    "bride"
   ],
   "unlockDay": 280,
   "rent": 3
  },
  {
   "id": "mountain",
   "label": "Alpine Spa",
   "clientele": [
    "hiker",
    "grandpa",
    "athlete",
    "musician",
    "artist",
    "farmer"
   ],
   "unlockDay": 380,
   "rent": 3
  }
 ],
 "seasons": [
  {
   "id": "spring",
   "days": [
    0,
    27
   ],
   "demand": {
    "makeup": 1.3,
    "brows": 1.2,
    "nails": 1.2
   },
   "note": "wedding and prom season"
  },
  {
   "id": "summer",
   "days": [
    28,
    55
   ],
   "demand": {
    "feet": 1.4,
    "skin": 1.3,
    "hair": 1.1
   },
   "note": "sandals, sunburn and beach waxing"
  },
  {
   "id": "autumn",
   "days": [
    56,
    83
   ],
   "demand": {
    "hair": 1.3,
    "facial": 1.2
   },
   "note": "new hair colour, back to school"
  },
  {
   "id": "winter",
   "days": [
    84,
    111
   ],
   "demand": {
    "hands": 1.3,
    "facial": 1.3,
    "massage": 1.2
   },
   "note": "dry skin and cosy treats"
  }
 ],
 "events": [
  {
   "id": "spa-sunday",
   "label": "Spa Sunday",
   "every": 7,
   "effect": "massage and masks +25% tips"
  },
  {
   "id": "valentines",
   "label": "Valentine's Week",
   "season": "winter",
   "effect": "couples book together; heart nail art"
  },
  {
   "id": "prom-night",
   "label": "Prom Night",
   "season": "spring",
   "effect": "a wave of teens wanting makeup and nails"
  },
  {
   "id": "wedding-fair",
   "label": "Wedding Fair",
   "season": "spring",
   "effect": "brides book packages"
  },
  {
   "id": "beach-opening",
   "label": "Beach Opening",
   "season": "summer",
   "effect": "feet and waxing rush"
  },
  {
   "id": "halloween",
   "label": "Halloween",
   "season": "autumn",
   "effect": "spooky makeup and nail art; costumed customers"
  },
  {
   "id": "new-year",
   "label": "New Year's Glam",
   "season": "winter",
   "effect": "glitter everything; big tips"
  },
  {
   "id": "influencer-visit",
   "label": "Influencer Visit",
   "random": 0.03,
   "effect": "a filmed treatment; nail it for a flood of new customers"
  },
  {
   "id": "rainy-day",
   "label": "Rainy Day",
   "random": 0.08,
   "effect": "fewer customers, but they stay for extras"
  }
 ],
 "marketing": [
  {
   "id": "flyers",
   "label": "Flyers",
   "cost": 1,
   "brings": [
    "grandma",
    "student",
    "teacher",
    "farmer"
   ],
   "effect": "+2 customers a day for 3 days"
  },
  {
   "id": "social",
   "label": "Social media",
   "cost": 2,
   "brings": [
    "teen",
    "student",
    "influencer",
    "streamer"
   ],
   "effect": "+3 young customers a day for 5 days"
  },
  {
   "id": "radio",
   "label": "Local radio",
   "cost": 3,
   "brings": [
    "office",
    "mechanic",
    "chef",
    "nurse"
   ],
   "effect": "+4 customers a day for 3 days"
  },
  {
   "id": "magazine",
   "label": "Beauty magazine",
   "cost": 5,
   "brings": [
    "model",
    "lawyer",
    "bride",
    "businessman"
   ],
   "effect": "richer customers for a week"
  },
  {
   "id": "loyalty",
   "label": "Loyalty cards",
   "cost": 2,
   "brings": [],
   "effect": "regulars visit 30% more often (permanent)"
  },
  {
   "id": "influencer",
   "label": "Invite an influencer",
   "cost": 6,
   "brings": [
    "influencer"
   ],
   "effect": "one filmed visit; a great job brings a crowd"
  }
 ],
 "packages": [
  {
   "id": "bride-glow",
   "label": "Bride Glow",
   "treatments": [
    "facial",
    "brows",
    "nails",
    "makeup"
   ],
   "bonus": 0.25
  },
  {
   "id": "spa-day",
   "label": "Spa Day",
   "treatments": [
    "massage",
    "facial",
    "feet"
   ],
   "bonus": 0.2
  },
  {
   "id": "fresh-start",
   "label": "Fresh Start",
   "treatments": [
    "facial",
    "nose"
   ],
   "bonus": 0.15
  },
  {
   "id": "hands-and-feet",
   "label": "Hands and Feet",
   "treatments": [
    "nails",
    "feet"
   ],
   "bonus": 0.15
  },
  {
   "id": "gentleman",
   "label": "The Gentleman",
   "treatments": [
    "shave",
    "facial",
    "hands"
   ],
   "bonus": 0.2
  },
  {
   "id": "red-carpet",
   "label": "Red Carpet",
   "treatments": [
    "facial",
    "lashes",
    "makeup",
    "hair",
    "nails"
   ],
   "bonus": 0.3
  }
 ]
}
