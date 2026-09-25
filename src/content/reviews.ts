/**
 * Copied from glow-salon-docs/content/reviews.json (the design content). Review grammar. A review = opener(voice) + one or two remarks (from what actually happened: stars, thoroughness, speed, treatment family, extras) + closer(voice). Placeholders: {salon} salon name, {staff} who treated them, {treatment} treatment name, {part} body part word. Pick without repeating recent lines. Stars 5 to 2 (a cozy game rarely goes lower; a 1-star only for a joke customer).
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
 "remarks": {
  "2": [
   "Half of it still looks the same.",
   "Felt a bit rushed.",
   "I expected more for the price.",
   "Long wait and some spots missed."
  ],
  "3": [
   "It was fine, a few spots left.",
   "Okay {treatment}, nothing special.",
   "The wait was a little long.",
   "Decent, could be more thorough.",
   "My {part} is better, not perfect."
  ],
  "4": [
   "Really good {treatment}, just a tiny bit missed.",
   "{staff} did a great job overall.",
   "Lovely result, a little slow but worth it.",
   "My {part} feels much better.",
   "Very nice, I'll come back.",
   "Almost perfect, one little patch left.",
   "Relaxing and nice."
  ],
  "5": [
   "My {part} has never felt this good.",
   "{staff} was so gentle and thorough.",
   "Not a single spot missed.",
   "The before and after photo is unreal.",
   "Every step was so satisfying to watch.",
   "The {treatment} was pure perfection.",
   "Spotless, glowing, perfect.",
   "They noticed things I didn't even know I had.",
   "I'll be dreaming about that {treatment}.",
   "So calm and so careful."
  ]
 },
 "extras": {
  "decor": [
   "The salon is gorgeous.",
   "Love the decor!",
   "Such a pretty place.",
   "The plants and lights are so cute."
  ],
  "cat": [
   "The salon cat sat on my lap!!",
   "10 out of 10 for the cat.",
   "Came for the {treatment}, stayed for the cat."
  ],
  "music": [
   "The music is so relaxing.",
   "Great playlist."
  ],
  "tea": [
   "Free tea while I waited, nice touch.",
   "The tea corner is adorable."
  ],
  "fast": [
   "In and out, super quick.",
   "Didn't even have to wait."
  ],
  "disaster": [
   "I came in a total disaster and left a new person.",
   "They didn't even flinch at my {part}. Heroes.",
   "Honestly I'm embarrassed how bad it was. Not anymore!"
  ],
  "regular": [
   "As always, the best.",
   "My favourite place in town.",
   "Every visit is better than the last.",
   "They remember exactly how I like it."
  ],
  "four-hands": [
   "Two people on me at once, felt like royalty.",
   "Teamwork makes the dream work!"
  ],
  "pricey": [
   "A bit pricey though.",
   "Worth it, but not cheap."
  ],
  "bargain": [
   "Amazing value.",
   "Can't believe the price."
  ],
  "feet": [
   "My heels are baby soft now.",
   "Sandal season, here I come!",
   "They clipped, filed and polished every single toe.",
   "I didn't know my feet could feel this light.",
   "The foot bath alone was worth it.",
   "My toes have never looked this cute."
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
