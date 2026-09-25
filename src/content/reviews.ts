/**
 * Copied from glow-salon-docs/content/reviews.json (the design content). Review grammar. A review = opener(voice) + one or two remarks (from what actually happened: stars, thoroughness, speed, treatment family, extras) + closer(voice). Placeholders: {salon} salon name, {staff} who treated them, {treatment} treatment name, {part} body part word. Pick without repeating a line within a day. openersLow and closersLow replace the voice's openers and closers for three stars and under; extras.photo only when a photo was saved. Stars 5 to 2 (a cozy game rarely goes lower; a 1-star only for a joke customer).
 * Edit the JSON there, then copy it here again, so the design and the game never drift.
 */
export const REVIEWS_DATA = {
 "openers": {
  "casual": [
   "ok so",
   "honestly",
   "not gonna lie",
   "lowkey",
   "ngl",
   "so I finally tried {salon} and",
   "came in on a whim and"
  ],
  "polite": [
   "What a lovely visit.",
   "Very pleasant experience.",
   "I was pleasantly surprised.",
   "A nice little salon.",
   "Thank you to the team at {salon}."
  ],
  "warm": [
   "Oh my dear,",
   "What sweet people.",
   "Such a cosy little place.",
   "I felt right at home.",
   "Lovely young people here."
  ],
  "upbeat": [
   "Wow!",
   "Absolutely loved it!",
   "Best decision today!",
   "Yes yes yes!",
   "Came in tired, left glowing!"
  ],
  "plain": [
   "Good place.",
   "Did the job.",
   "Fair price.",
   "No fuss.",
   "Straightforward."
  ],
  "cool": [
   "Solid.",
   "Chill spot.",
   "Vibes were right.",
   "Respect.",
   "Pretty rad."
  ],
  "formal": [
   "A professional service.",
   "Efficient and courteous.",
   "I appreciate attention to detail.",
   "Commendable standards.",
   "Punctual and precise."
  ],
  "excited": [
   "OMG!!",
   "I'm literally crying!",
   "Best day ever!!",
   "I can't stop smiling!",
   "My heart!!"
  ],
  "dramatic": [
   "STOP.",
   "I'm OBSESSED.",
   "This changed my LIFE.",
   "Iconic.",
   "I have never looked this good. Ever."
  ],
  "dreamy": [
   "Like a little dream.",
   "Floating right now.",
   "So soft, so calm.",
   "A tiny paradise.",
   "Colours and calm."
  ],
  "sleepy": [
   "I fell asleep. Twice.",
   "Finally some peace.",
   "So relaxing I nearly missed my bus.",
   "Came in exhausted.",
   "Best nap I've had in years."
  ],
  "loud": [
   "BOOM!",
   "ALRIGHT!",
   "THAT'S HOW IT'S DONE!",
   "LET'S GO!",
   "HUGE!"
  ]
 },
 "openersLow": {
  "casual": [
   "ok so",
   "honestly",
   "not gonna lie",
   "hmm so",
   "ngl"
  ],
  "polite": [
   "An okay visit.",
   "A mixed experience.",
   "I had hoped for a little more.",
   "Thank you to the team at {salon}."
  ],
  "warm": [
   "Oh my dear,",
   "Such a cosy little place.",
   "Lovely young people here.",
   "Well, dears,"
  ],
  "upbeat": [
   "Hmm!",
   "So close!",
   "Okay, so!",
   "Not my best visit!"
  ],
  "plain": [
   "Did the job.",
   "Okay.",
   "Average.",
   "Straightforward."
  ],
  "cool": [
   "Eh.",
   "Chill spot.",
   "Mixed vibes.",
   "It was alright."
  ],
  "formal": [
   "An adequate service.",
   "Room for improvement.",
   "A mixed impression.",
   "Courteous, if hurried."
  ],
  "excited": [
   "Hmm, okay!!",
   "I wanted to love it!!",
   "Oh no!!",
   "Not quite!!"
  ],
  "dramatic": [
   "Hmm.",
   "Tragic, honestly.",
   "Not the glow-up I was promised.",
   "I'm conflicted."
  ],
  "dreamy": [
   "A little cloudy today.",
   "Half a dream.",
   "Not quite the calm I hoped for.",
   "Soft, but short."
  ],
  "sleepy": [
   "Came in exhausted.",
   "I didn't even get to nap.",
   "Too quick to relax.",
   "Hmm, still tired."
  ],
  "loud": [
   "HMM.",
   "NOT BAD, NOT GREAT.",
   "OKAY THEN.",
   "WELL."
  ]
 },
 "remarks": {
  "2": [
   "Half of it still looks the same.",
   "Felt a bit rushed.",
   "I expected more for the price.",
   "Long wait and some spots missed.",
   "Some steps felt skipped.",
   "Not the glow-up I came for.",
   "My {part} looks about the same.",
   "It all went by in a blur.",
   "Nice people, but it felt hurried.",
   "I think a few things got missed."
  ],
  "3": [
   "It was fine, a few spots left.",
   "Okay {treatment}, nothing special.",
   "The wait was a little long.",
   "Decent, could be more thorough.",
   "My {part} is better, not perfect.",
   "Pleasant enough, a bit hurried.",
   "Some of it was lovely, some was rushed.",
   "A good start, not the full treatment.",
   "I liked parts of it.",
   "Fine, but I've had better."
  ],
  "4": [
   "Really good {treatment}, just a tiny bit missed.",
   "{staff} did a great job overall.",
   "Lovely result, a little slow but worth it.",
   "My {part} feels much better.",
   "Very nice, I'll come back.",
   "Almost perfect, one little patch left.",
   "Relaxing and nice.",
   "My {part} looks so much fresher.",
   "A really nice {treatment}, calm and careful.",
   "Good work, and so relaxing.",
   "Left feeling lighter.",
   "Great {treatment}, a tiny bit rushed at the end.",
   "I'd happily book again."
  ],
  "5": [
   "My {part} has never felt this good.",
   "{staff} was so gentle and thorough.",
   "Not a single spot missed.",
   "Every step was so satisfying to watch.",
   "The {treatment} was pure perfection.",
   "Spotless, glowing, perfect.",
   "They noticed things I didn't even know I had.",
   "I'll be dreaming about that {treatment}.",
   "So calm and so careful.",
   "I didn't want it to end.",
   "Every little detail was looked after.",
   "My {part} looks brand new.",
   "Honestly the best {treatment} I've ever had.",
   "{staff} made it look effortless.",
   "I left feeling like myself again.",
   "Calm, gentle and so thorough.",
   "Worth every single penny.",
   "I keep looking in the mirror.",
   "They took their time with everything.",
   "It felt like a proper treat.",
   "The attention to detail is unreal.",
   "I walked out floating."
  ]
 },
 "extras": {
  "decor": [
   "The salon is gorgeous.",
   "Love the decor!",
   "Such a pretty place.",
   "The plants and lights are so cute.",
   "Every corner is so pretty.",
   "The whole place feels like a hug.",
   "Such cute little details everywhere.",
   "I want my living room to look like this.",
   "Gorgeous interior, so calming.",
   "The colours in here are so soft.",
   "I could sit in that salon all day.",
   "It's the prettiest salon in town."
  ],
  "cat": [
   "The salon cat sat on my lap!!",
   "10 out of 10 for the cat.",
   "Came for the {treatment}, stayed for the cat.",
   "The salon cat said hello on my way in.",
   "Bonus points for the sleepy cat.",
   "The cat supervised the whole thing.",
   "A purring cat by the sofa, what more could you want.",
   "I'm coming back for the cat, honestly.",
   "The salon cat is a little celebrity.",
   "The cat gave me a slow blink. Five stars.",
   "Didn't expect a cat, loved the cat."
  ],
  "music": [
   "The music is so relaxing.",
   "Great playlist.",
   "Loved the soft music.",
   "The playlist was a vibe.",
   "Such calming background music."
  ],
  "tea": [
   "Free tea while I waited, nice touch.",
   "The tea corner is adorable."
  ],
  "fast": [
   "In and out, super quick.",
   "Didn't even have to wait.",
   "Quick and still thorough.",
   "No waiting around at all.",
   "They got to me right away.",
   "Fast, calm and careful.",
   "Perfect for a lunch break.",
   "Right on time, no fuss.",
   "In the chair within minutes.",
   "Didn't waste a second of my day.",
   "Efficient without feeling rushed.",
   "Quick in, glowing out."
  ],
  "disaster": [
   "I came in a total disaster and left a new person.",
   "They didn't even flinch at my {part}. Heroes.",
   "Honestly I'm embarrassed how bad it was. Not anymore!",
   "They saved me, honestly.",
   "I was a mess and they were so kind about it."
  ],
  "regular": [
   "As always, the best.",
   "My favourite place in town.",
   "Every visit is better than the last.",
   "They remember exactly how I like it.",
   "They always remember my name.",
   "Never disappoints.",
   "Still my favourite spot.",
   "Back again, and still in love."
  ],
  "four-hands": [
   "Two people on me at once, felt like royalty.",
   "Teamwork makes the dream work!",
   "Two of them at once, pure luxury.",
   "Double the hands, double the pampering."
  ],
  "pricey": [
   "A bit pricey though.",
   "Worth it, but not cheap.",
   "Not cheap, but I get why."
  ],
  "bargain": [
   "Amazing value.",
   "Can't believe the price.",
   "So much for the price."
  ],
  "feet": [
   "My heels are baby soft now.",
   "Sandal season, here I come!",
   "They clipped, filed and polished every single toe.",
   "I didn't know my feet could feel this light.",
   "The foot bath alone was worth it.",
   "My toes have never looked this cute.",
   "My feet feel like new.",
   "Walking home felt like floating."
  ],
  "photo": [
   "The before and after photo is unreal.",
   "They saved a before and after photo for me. Framing it.",
   "I've shown the before and after photo to everyone.",
   "That before and after photo is going straight on my feed.",
   "Couldn't believe the before and after shot."
  ]
 },
 "closers": {
  "casual": [
   "10/10 would come back",
   "go here fr",
   "obsessed tbh",
   "see u next week",
   "no notes"
  ],
  "polite": [
   "Recommended.",
   "I will return.",
   "Thank you!",
   "Highly recommended.",
   "Keep it up."
  ],
  "warm": [
   "Bless you all.",
   "I'll bring my friends.",
   "See you soon, dears.",
   "Thank you, sweethearts.",
   "Lovely, lovely."
  ],
  "upbeat": [
   "Coming back ASAP!",
   "Tell everyone!",
   "Five stars all day!",
   "Can't wait for next time!",
   "Go go go!"
  ],
  "plain": [
   "Will return.",
   "Recommend.",
   "Good.",
   "Fine by me.",
   "Worth it."
  ],
  "cool": [
   "Later.",
   "Peace.",
   "Back soon.",
   "Catch you next time.",
   "Legit."
  ],
  "formal": [
   "I shall return.",
   "Satisfactory in every respect.",
   "Well done.",
   "Recommended without reservation.",
   "My compliments."
  ],
  "excited": [
   "BEST SALON EVER!!",
   "I LOVE YOU ALL!!",
   "Booking again NOW!",
   "Screaming!!",
   "Wedding ready!!"
  ],
  "dramatic": [
   "Iconic. Period.",
   "Everyone needs this.",
   "I'm a new woman.",
   "Legendary.",
   "Bye, I'm famous now."
  ],
  "dreamy": [
   "Floating home.",
   "Thank you for the calm.",
   "Pure magic.",
   "So soft.",
   "Until next time."
  ],
  "sleepy": [
   "Going to sleep for a week.",
   "zzz. 5 stars.",
   "Peace at last.",
   "Thank you, truly.",
   "Back when I'm tired again. So, tomorrow."
  ],
  "loud": [
   "BEST IN TOWN!",
   "SEE YOU NEXT WEEK!",
   "UNREAL!",
   "TELL YOUR FRIENDS!",
   "CHAMPIONS!"
  ]
 },
 "closersLow": {
  "casual": [
   "idk, maybe next time",
   "mid tbh",
   "it was fine I guess",
   "might try again"
  ],
  "polite": [
   "Perhaps next time.",
   "Thank you anyway.",
   "Room to grow.",
   "I may return."
  ],
  "warm": [
   "Take your time next visit, dears.",
   "I'll give it another go.",
   "Bless you anyway.",
   "Slow down a little, sweethearts."
  ],
  "upbeat": [
   "Next time will be better!",
   "Still smiling, kind of!",
   "Onwards!",
   "I'll give it another try!"
  ],
  "plain": [
   "Fine.",
   "Could be better.",
   "Might return.",
   "It'll do."
  ],
  "cool": [
   "Whatever.",
   "We'll see.",
   "Maybe.",
   "Later, I guess."
  ],
  "formal": [
   "I shall reserve judgement.",
   "Improvement is expected.",
   "Adequate.",
   "Noted."
  ],
  "excited": [
   "NEXT TIME FOR SURE!!",
   "Still hopeful!!",
   "Maybe next time!!",
   "I'll be back to check!!"
  ],
  "dramatic": [
   "The drama.",
   "I'll recover.",
   "Do better, darlings.",
   "Rated: a sigh."
  ],
  "dreamy": [
   "Drifting home, a little unfinished.",
   "Until next time, maybe.",
   "Soft, but not enough.",
   "Half asleep, half sure."
  ],
  "sleepy": [
   "Going home to sleep it off.",
   "zzz. Meh.",
   "Maybe after a nap.",
   "Tired either way."
  ],
  "loud": [
   "COULD BE BETTER!",
   "TRY HARDER!",
   "WE'LL SEE!",
   "NEXT TIME!"
  ]
 },
 "emoji": {
  "dramatic": [
   "✨",
   "💅",
   "😍",
   "🔥",
   "👑"
  ],
  "excited": [
   "💖",
   "😭",
   "🥰",
   "✨"
  ],
  "casual": [
   "✨",
   "👍",
   "💯"
  ],
  "upbeat": [
   "😊",
   "🙌",
   "✨"
  ]
 }
}
