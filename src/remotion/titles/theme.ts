import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

// Landscape title cards, in the look of the app's call screen (the dark red room Maya talks in).
export const W = 1920;
export const H = 1080;
export const FPS = 30;

export const theme = {
  ink: "#FFF4EE",
  glow: "#FF6A55",
  serif: "'Outerview Serif', Georgia, serif",
};

/** The call screen's backdrop: a warm red lamp in the middle, falling off to near black. */
export const callBackground = "radial-gradient(70% 90% at 50% 42%, #B4452F 0%, #7A2A20 38%, #3A1512 72%, #1E0D0C 100%)";

/** Hold every frame until the serif is in, so none renders in the fallback face. */
export function useSerif() {
  const [handle] = useState(() => delayRender("Loading Outerview Serif"));
  useEffect(() => {
    const font = new FontFace("Outerview Serif", `url(${staticFile("fonts/OuterviewSerif-VF.woff2")}) format("woff2")`, {
      weight: "300 700",
    });
    font
      .load()
      .then(() => document.fonts.add(font))
      .finally(() => continueRender(handle));
  }, [handle]);
}
