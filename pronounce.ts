// How to say words the narrator would otherwise read in the wrong language, per narration
// language. The key is the word as written in scripts and shown in captions; the value is
// what ElevenLabs is given instead, spelled so this language's reader says it right.
// Try spellings with: npm run say -- --lang fi "Tämä on Outerview."
export const pronounce: Record<string, Record<string, string>> = {
  fi: {
    Outerview: "Autervjuu",
  },
};
