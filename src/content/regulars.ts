/**
 * Copied from glow-salon-docs/content/regulars.json (the design content). Named regulars. Each returns every few days once met. Friendship rises with good treatments (1 to 5); each level shows its story beat as a short chat line while they are treated, and level 5 gives the gift (a decor item, product or tool skin) and they start referring friends. 'arrives' = salon star rating needed. Keep lines short and sweet.
 * Edit the JSON there, then copy it here again, so the design and the game never drift.
 */
export const REGULARS_DATA = {
 "regulars": [
  {
   "id": "rosa",
   "name": "Nonna Rosa",
   "archetype": "grandma",
   "favourite": "hands",
   "arrives": 0,
   "gift": "decor:lemon-tree",
   "beats": [
    "These hands made pasta for 60 years, you know.",
    "My granddaughter says your salon is 'aesthetic'. I said it's cosy.",
    "I brought you my lemon cake recipe. Do not tell my sister.",
    "My hands haven't felt this soft since my wedding.",
    "Take my lemon tree. It likes your window better than mine."
   ]
  },
  {
   "id": "maya",
   "name": "Maya",
   "archetype": "bride",
   "favourite": "nails",
   "arrives": 2,
   "gift": "polish:rose-gold",
   "beats": [
    "The wedding is in five visits! I'm so nervous!",
    "We picked the cake. Three layers. Lemon, of course.",
    "My mum cried at the dress fitting. I cried too.",
    "Tomorrow is the big day. Make my hands perfect?",
    "We're married!! Here, the wedding colour. It's yours now."
   ]
  },
  {
   "id": "leo",
   "name": "Leo",
   "archetype": "athlete",
   "favourite": "feet",
   "arrives": 0,
   "gift": "tool:sport-rasp",
   "beats": [
    "Marathon training. My feet are a crime scene.",
    "Twenty miles today. Do your worst.",
    "New personal best! I think the pedicures help.",
    "Race day is Sunday. Wish me luck.",
    "I finished! Keep this rasp, it's legendary now."
   ]
  },
  {
   "id": "jade",
   "name": "Jade",
   "archetype": "influencer",
   "favourite": "facial",
   "arrives": 3,
   "gift": "decor:ring-light",
   "beats": [
    "Can I film this? My followers LOVE pimple pops.",
    "The video got 2 million views. You're famous!",
    "Everyone asks where I go. I tell them. Sorry, you'll be busy.",
    "Honestly, off camera, this is my favourite hour of the week.",
    "A ring light for the salon. For our next collab."
   ]
  },
  {
   "id": "gus",
   "name": "Old Gus",
   "archetype": "grandpa",
   "favourite": "ears",
   "arrives": 1,
   "gift": "decor:grandfather-clock",
   "beats": [
    "Eh? Speak up! Oh, that's why I'm here.",
    "I heard a bird this morning. First time in years.",
    "My wife says I finally listen. Don't tell her it's the ears.",
    "Played the piano for her last night. Heard every note.",
    "My old clock. It chimes beautifully. You'll hear it."
   ]
  },
  {
   "id": "priya",
   "name": "Priya",
   "archetype": "nurse",
   "favourite": "feet",
   "arrives": 1,
   "gift": "product:cooling-gel",
   "beats": [
    "Fourteen-hour shift. My feet are screaming.",
    "Night shifts again. This is my reward.",
    "I got promoted to head nurse!",
    "I tell my patients about you. Self-care matters.",
    "Our clinic's best cooling gel. For your customers."
   ]
  },
  {
   "id": "kai",
   "name": "Kai",
   "archetype": "surfer",
   "favourite": "skin",
   "arrives": 2,
   "gift": "decor:surfboard",
   "beats": [
    "Too much sun, man. Peel me.",
    "Caught a wave taller than your salon.",
    "Sunscreen now. You were right.",
    "Starting a surf school for kids!",
    "My old board. Hang it up, it's good luck."
   ]
  },
  {
   "id": "mira",
   "name": "Mira",
   "archetype": "artist",
   "favourite": "nails",
   "arrives": 2,
   "gift": "decor:painting",
   "beats": [
    "Can you do nails like a Monet painting?",
    "I'm painting your salon from memory. The light is perfect.",
    "My gallery show opens next week!",
    "I sold three paintings. Treat yourself, I said.",
    "The painting of your salon. It's finished. It's yours."
   ]
  },
  {
   "id": "tomas",
   "name": "Tomas",
   "archetype": "chef",
   "favourite": "hands",
   "arrives": 1,
   "gift": "decor:espresso-machine",
   "beats": [
    "Onions, burns, knife nicks. Chef hands.",
    "We got a new review. Four stars. I'm furious.",
    "I'm testing a new dessert. You're my taster.",
    "We got the star! A real one!",
    "Espresso machine for your staff. They deserve it."
   ]
  },
  {
   "id": "hazel",
   "name": "Hazel",
   "archetype": "gardener",
   "favourite": "hands",
   "arrives": 1,
   "gift": "decor:orchid",
   "beats": [
    "Soil under every nail, as usual.",
    "My roses won a ribbon at the fair!",
    "I'm growing a lavender field. For calm.",
    "I've started giving tours of my garden.",
    "A rare orchid. It likes humid rooms, like yours."
   ]
  },
  {
   "id": "rex",
   "name": "Rex",
   "archetype": "wrestler",
   "favourite": "ears",
   "arrives": 3,
   "gift": "decor:championship-belt",
   "beats": [
    "CAULIFLOWER EARS! THE WORST!",
    "I WON LAST NIGHT! HUGE!",
    "SECRET: I LOVE THE FACE MASKS.",
    "I'M RETIRING. OPENING A GYM.",
    "MY BELT! HANG IT! CHAMPIONS!"
   ]
  },
  {
   "id": "elise",
   "name": "Elise",
   "archetype": "dancer",
   "favourite": "feet",
   "arrives": 2,
   "gift": "decor:ballet-shoes",
   "beats": [
    "Pointe shoes are beautiful torture.",
    "I got the lead in Swan Lake!",
    "Opening night is soon. My feet need you.",
    "Standing ovation. Eight minutes.",
    "My first pointe shoes. Signed, for your wall."
   ]
  },
  {
   "id": "dev",
   "name": "Dev",
   "archetype": "gamer",
   "favourite": "hands",
   "arrives": 1,
   "gift": "decor:arcade-cabinet",
   "beats": [
    "My wrists have played 10,000 hours.",
    "Made it to the finals!",
    "My team calls this the 'hand spa strat'.",
    "We won the tournament!",
    "An arcade cabinet. For waiting customers."
   ]
  },
  {
   "id": "bea",
   "name": "Bea",
   "archetype": "baker",
   "favourite": "facial",
   "arrives": 1,
   "gift": "product:honey-mask",
   "beats": [
    "Flour everywhere. Even my eyebrows.",
    "Four a.m. starts. Tired skin.",
    "Brought croissants for the staff.",
    "Opening a second bakery!",
    "My honey mask recipe. The bees approve."
   ]
  },
  {
   "id": "otto",
   "name": "Otto",
   "archetype": "businessman",
   "favourite": "shave",
   "arrives": 2,
   "gift": "tool:silver-razor",
   "beats": [
    "Big meeting. I must look sharp.",
    "Closed the deal. Your shave helped.",
    "I'm cutting back to four days a week.",
    "Took my kids to the zoo. First time in a year.",
    "My grandfather's silver razor. You'll use it well."
   ]
  },
  {
   "id": "lulu",
   "name": "Lulu",
   "archetype": "teen",
   "favourite": "facial",
   "arrives": 0,
   "gift": "decor:plushie",
   "beats": [
    "School photo tomorrow and my skin is ANGRY.",
    "The photo was fine! Better than fine!",
    "I asked someone to the dance. They said yes!",
    "My skin is so clear my mum asked what happened.",
    "A plushie for your sofa. It's cute, like here."
   ]
  },
  {
   "id": "ivan",
   "name": "Ivan",
   "archetype": "mechanic",
   "favourite": "hands",
   "arrives": 1,
   "gift": "decor:vintage-sign",
   "beats": [
    "Engine grease is forever. Prove me wrong.",
    "Fixed a 1962 roadster today. Beauty.",
    "My daughter wants to be a mechanic too.",
    "Opening my own garage!",
    "An old garage sign. It glows. Hang it up."
   ]
  },
  {
   "id": "sol",
   "name": "Sol",
   "archetype": "musician",
   "favourite": "hands",
   "arrives": 2,
   "gift": "music:sol-song",
   "beats": [
    "Guitar calluses. Keep them, remove the rest.",
    "Writing a song about calm places.",
    "It's about your salon. Don't laugh.",
    "We played it on the radio!",
    "The song, recorded for your salon's playlist."
   ]
  },
  {
   "id": "yuki",
   "name": "Yuki",
   "archetype": "model",
   "favourite": "lashes",
   "arrives": 4,
   "gift": "decor:vanity",
   "beats": [
    "Fashion week. Everything must be flawless.",
    "Paris was a blur. I missed calm.",
    "I'm modelling for a charity show.",
    "I'm launching my own skincare line.",
    "A vanity from the show. For your makeup corner."
   ]
  },
  {
   "id": "bruno",
   "name": "Bruno",
   "archetype": "farmer",
   "favourite": "feet",
   "arrives": 0,
   "gift": "product:goat-milk-soap",
   "beats": [
    "Boots all day. Mud all night.",
    "The goats had babies! Six of them!",
    "Brought you fresh eggs.",
    "Starting a little farm shop.",
    "Goat milk soap. The goats insisted."
   ]
  },
  {
   "id": "celeste",
   "name": "Celeste",
   "archetype": "lawyer",
   "favourite": "facial",
   "arrives": 3,
   "gift": "decor:chandelier",
   "beats": [
    "Trial tomorrow. Stress is showing.",
    "We won. I slept twelve hours.",
    "Taking my first holiday in five years.",
    "I'm becoming a judge.",
    "A chandelier. Your lobby deserves sparkle."
   ]
  },
  {
   "id": "pip",
   "name": "Pip",
   "archetype": "toddler-parent",
   "favourite": "massage",
   "arrives": 1,
   "gift": "decor:hammock",
   "beats": [
    "Twins. Teething. Send help.",
    "They slept through the night! Once!",
    "First day of nursery. I cried more than they did.",
    "They said 'mama' at the same time!",
    "A hammock for your break room. Rest matters."
   ]
  },
  {
   "id": "noor",
   "name": "Noor",
   "archetype": "teacher",
   "favourite": "nails",
   "arrives": 1,
   "gift": "decor:bookshelf",
   "beats": [
    "Thirty kids and glitter glue everywhere.",
    "My class won the science fair!",
    "I'm writing a children's book.",
    "It's getting published!",
    "A bookshelf, with my book on it. For the waiting room."
   ]
  },
  {
   "id": "finn",
   "name": "Finn",
   "archetype": "hiker",
   "favourite": "feet",
   "arrives": 1,
   "gift": "decor:mountain-poster",
   "beats": [
    "Blisters on my blisters.",
    "Summited my first 4000 m peak!",
    "Planning the long trail next spring.",
    "I did the whole trail. Three months!",
    "A poster of the summit. For your wall."
   ]
  },
  {
   "id": "stella",
   "name": "Stella",
   "archetype": "streamer",
   "favourite": "makeup",
   "arrives": 3,
   "gift": "decor:neon-heart",
   "beats": [
    "Going live in an hour. Make me camera-ready?",
    "Chat LOVES your work.",
    "Hit 100k followers!",
    "I'm doing a charity stream for the animal shelter.",
    "A neon heart. Your salon has one now."
   ]
  },
  {
   "id": "ahmed",
   "name": "Ahmed",
   "archetype": "pilot",
   "favourite": "shave",
   "arrives": 3,
   "gift": "decor:globe",
   "beats": [
    "Three time zones in two days. My face shows it.",
    "Flew over the northern lights last night.",
    "Training new pilots now.",
    "Captain now. Four stripes!",
    "A globe with every place I've flown. For you."
   ]
  },
  {
   "id": "greta",
   "name": "Greta",
   "archetype": "grandma",
   "favourite": "hair",
   "arrives": 1,
   "gift": "decor:knitted-cushions",
   "beats": [
    "Blue rinse, dear, like always.",
    "My knitting club meets here next week. Joke. Unless?",
    "Learned to video call my grandson!",
    "Turned 90. Still fabulous.",
    "Knitted cushions for your sofa. Soft, like you."
   ]
  },
  {
   "id": "zane",
   "name": "Zane",
   "archetype": "rocker",
   "favourite": "hair",
   "arrives": 1,
   "gift": "decor:electric-guitar",
   "beats": [
    "Blue hair. No, bluer.",
    "Played a sold-out gig!",
    "Writing a ballad. Don't tell the band.",
    "We're touring Europe!",
    "My first guitar. Rock on, salon."
   ]
  },
  {
   "id": "iris",
   "name": "Iris",
   "archetype": "office",
   "favourite": "massage",
   "arrives": 0,
   "gift": "decor:desk-plant",
   "beats": [
    "Spreadsheets. So many spreadsheets.",
    "I got the promotion!",
    "I'm learning pottery on Thursdays.",
    "I quit! Opening a flower shop!",
    "A little plant from my new shop."
   ]
  },
  {
   "id": "marco",
   "name": "Marco",
   "archetype": "student",
   "favourite": "brows",
   "arrives": 0,
   "gift": "decor:diploma",
   "beats": [
    "Exams. Stress. Unibrow.",
    "Passed my first exam!",
    "Got an internship!",
    "Graduated!!",
    "A copy of my diploma. You kept me sane."
   ]
  },
  {
   "id": "lady-v",
   "name": "Lady Victoria",
   "archetype": "royal",
   "favourite": "facial",
   "arrives": 5,
   "gift": "decor:royal-portrait",
   "beats": [
    "One travels incognito. Do be discreet.",
    "One has not relaxed like this in years.",
    "One would like to recommend you to the palace.",
    "One has made you Royal Beauty Warrant holders.",
    "A portrait, for your wall. One insists."
   ]
  }
 ]
}
