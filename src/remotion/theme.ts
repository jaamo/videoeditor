// Outerview brand, from outerview/main/client/src/index.css and DESIGN-SYSTEM.md.
export const theme = {
  red: "#E63B2E",
  bg: "#FAF8F5",
  peach: "#F6DCC8",
  ink: "#111111",
  inkWarm: "#3B2A22",
  muted: "#7A756D",
  border: "#E4DFD8",
  font: "'Google Sans Flex', system-ui, sans-serif",
};

/** The warm wash the app uses behind its interview cards. */
export const warmBackground = `radial-gradient(120% 70% at 50% 35%, #FBE6D6 0%, ${theme.bg} 70%)`;

/** The title card's length when nobody speaks over it. */
export const INTRO_MS = 2200;
/** An intro line starts this far into the title card, and the card holds this long after it. */
export const INTRO_LEAD_MS = 500;
export const INTRO_TAIL_MS = 600;
export const OUTRO_MS = 3200;
/** Scenes cross-fade over this long. */
export const FADE_MS = 400;
