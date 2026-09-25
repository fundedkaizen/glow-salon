/**
 * Copied from glow-salon-docs/content/archetypes.json (the design content). Customer archetypes. budget: 1 (tight) to 5 (lavish). favourites: treatment families they ask for most. voice: how their reviews sound. unlock: salon star rating needed before they visit.
 * Edit the JSON there, then copy it here again, so the design and the game never drift.
 */
export const ARCHETYPES_DATA = {
 "archetypes": [
  {
   "id": "student",
   "label": "Student",
   "budget": 1,
   "favourites": [
    "facial",
    "nails",
    "brows"
   ],
   "voice": "casual",
   "unlock": 0
  },
  {
   "id": "office",
   "label": "Office worker",
   "budget": 3,
   "favourites": [
    "nails",
    "massage",
    "facial"
   ],
   "voice": "polite",
   "unlock": 0
  },
  {
   "id": "grandma",
   "label": "Grandma",
   "budget": 2,
   "favourites": [
    "hair",
    "feet",
    "nails"
   ],
   "voice": "warm",
   "unlock": 0
  },
  {
   "id": "athlete",
   "label": "Athlete",
   "budget": 3,
   "favourites": [
    "feet",
    "massage",
    "skin"
   ],
   "voice": "upbeat",
   "unlock": 0
  },
  {
   "id": "teen",
   "label": "Teenager",
   "budget": 1,
   "favourites": [
    "facial",
    "nose",
    "nails"
   ],
   "voice": "casual",
   "unlock": 0
  },
  {
   "id": "farmer",
   "label": "Farmer",
   "budget": 2,
   "favourites": [
    "feet",
    "hands",
    "skin"
   ],
   "voice": "plain",
   "unlock": 0
  },
  {
   "id": "chef",
   "label": "Chef",
   "budget": 3,
   "favourites": [
    "hands",
    "nails",
    "massage"
   ],
   "voice": "plain",
   "unlock": 1
  },
  {
   "id": "nurse",
   "label": "Nurse",
   "budget": 2,
   "favourites": [
    "feet",
    "massage",
    "facial"
   ],
   "voice": "warm",
   "unlock": 1
  },
  {
   "id": "gamer",
   "label": "Gamer",
   "budget": 2,
   "favourites": [
    "hands",
    "facial",
    "ears"
   ],
   "voice": "casual",
   "unlock": 1
  },
  {
   "id": "rocker",
   "label": "Rocker",
   "budget": 2,
   "favourites": [
    "hair",
    "ears",
    "shave"
   ],
   "voice": "cool",
   "unlock": 1
  },
  {
   "id": "dancer",
   "label": "Dancer",
   "budget": 3,
   "favourites": [
    "feet",
    "lashes",
    "makeup"
   ],
   "voice": "upbeat",
   "unlock": 2
  },
  {
   "id": "businessman",
   "label": "Businessman",
   "budget": 4,
   "favourites": [
    "shave",
    "facial",
    "nails"
   ],
   "voice": "formal",
   "unlock": 2
  },
  {
   "id": "bride",
   "label": "Bride-to-be",
   "budget": 4,
   "favourites": [
    "makeup",
    "nails",
    "brows",
    "lashes"
   ],
   "voice": "excited",
   "unlock": 2
  },
  {
   "id": "influencer",
   "label": "Influencer",
   "budget": 4,
   "favourites": [
    "makeup",
    "lashes",
    "facial"
   ],
   "voice": "dramatic",
   "unlock": 3
  },
  {
   "id": "gardener",
   "label": "Gardener",
   "budget": 2,
   "favourites": [
    "hands",
    "feet",
    "nails"
   ],
   "voice": "warm",
   "unlock": 1
  },
  {
   "id": "musician",
   "label": "Musician",
   "budget": 2,
   "favourites": [
    "hands",
    "hair",
    "ears"
   ],
   "voice": "cool",
   "unlock": 2
  },
  {
   "id": "surfer",
   "label": "Surfer",
   "budget": 2,
   "favourites": [
    "skin",
    "hair",
    "feet"
   ],
   "voice": "cool",
   "unlock": 2
  },
  {
   "id": "teacher",
   "label": "Teacher",
   "budget": 3,
   "favourites": [
    "massage",
    "facial",
    "nails"
   ],
   "voice": "polite",
   "unlock": 1
  },
  {
   "id": "mechanic",
   "label": "Mechanic",
   "budget": 2,
   "favourites": [
    "hands",
    "nails",
    "skin"
   ],
   "voice": "plain",
   "unlock": 1
  },
  {
   "id": "artist",
   "label": "Artist",
   "budget": 2,
   "favourites": [
    "nails",
    "hair",
    "makeup"
   ],
   "voice": "dreamy",
   "unlock": 2
  },
  {
   "id": "hiker",
   "label": "Hiker",
   "budget": 2,
   "favourites": [
    "feet",
    "skin",
    "massage"
   ],
   "voice": "upbeat",
   "unlock": 1
  },
  {
   "id": "baker",
   "label": "Baker",
   "budget": 2,
   "favourites": [
    "hands",
    "facial",
    "brows"
   ],
   "voice": "warm",
   "unlock": 1
  },
  {
   "id": "lawyer",
   "label": "Lawyer",
   "budget": 5,
   "favourites": [
    "facial",
    "nails",
    "massage"
   ],
   "voice": "formal",
   "unlock": 3
  },
  {
   "id": "model",
   "label": "Model",
   "budget": 5,
   "favourites": [
    "facial",
    "lashes",
    "brows",
    "makeup"
   ],
   "voice": "dramatic",
   "unlock": 4
  },
  {
   "id": "grandpa",
   "label": "Grandpa",
   "budget": 2,
   "favourites": [
    "ears",
    "shave",
    "feet"
   ],
   "voice": "warm",
   "unlock": 1
  },
  {
   "id": "toddler-parent",
   "label": "Tired parent",
   "budget": 3,
   "favourites": [
    "massage",
    "facial",
    "nails"
   ],
   "voice": "sleepy",
   "unlock": 1
  },
  {
   "id": "wrestler",
   "label": "Wrestler",
   "budget": 3,
   "favourites": [
    "ears",
    "skin",
    "massage"
   ],
   "voice": "loud",
   "unlock": 3
  },
  {
   "id": "pilot",
   "label": "Pilot",
   "budget": 4,
   "favourites": [
    "facial",
    "shave",
    "massage"
   ],
   "voice": "formal",
   "unlock": 3
  },
  {
   "id": "streamer",
   "label": "Streamer",
   "budget": 3,
   "favourites": [
    "facial",
    "makeup",
    "hair"
   ],
   "voice": "dramatic",
   "unlock": 3
  },
  {
   "id": "royal",
   "label": "Visiting royal",
   "budget": 5,
   "favourites": [
    "facial",
    "makeup",
    "nails",
    "massage"
   ],
   "voice": "formal",
   "unlock": 5
  }
 ],
 "traits": [
  {
   "id": "ticklish",
   "effect": "giggles and wriggles on feet and hands; big reactions"
  },
  {
   "id": "chatty",
   "effect": "speech bubbles with small talk; tips more when you finish slowly and thoroughly"
  },
  {
   "id": "nervous",
   "effect": "flinches more at pops and rips; very grateful at the end"
  },
  {
   "id": "picky",
   "effect": "notices the last 5 percent; big tip for perfection"
  },
  {
   "id": "generous",
   "effect": "tips well regardless"
  },
  {
   "id": "sleepy",
   "effect": "dozes off during massage and masks; snores softly"
  },
  {
   "id": "dramatic",
   "effect": "gasps and cheers; reviews in capitals and emojis"
  },
  {
   "id": "shy",
   "effect": "short reviews; blushes at compliments"
  },
  {
   "id": "impatient",
   "effect": "taps a foot while waiting but never leaves; likes speed"
  },
  {
   "id": "curious",
   "effect": "asks about the tools; likes premium products"
  },
  {
   "id": "sweet-tooth",
   "effect": "brings pastries for the staff sometimes"
  },
  {
   "id": "animal-lover",
   "effect": "adores the salon cat"
  }
 ]
}
