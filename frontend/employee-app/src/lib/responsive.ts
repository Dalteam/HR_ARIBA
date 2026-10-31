// One place that decides layout sizes from the screen width, so every screen behaves the same on a small phone
// (320-360), a normal phone (375-430), a large phone and an iPad (700+): side margins, how wide the content may grow,
// how many tiles fit a row. Screens read this instead of using fixed pixel / percentage widths.
import { useWindowDimensions } from "react-native";

export const MAX_FONT_SCALE = 1.25; // the user's text-size setting is respected, but capped so layouts do not break

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const tablet = width >= 700;
  return {
    width, height, tablet,
    compact: width < 360,                       // iPhone SE / small Android
    cols: tablet ? 4 : 3,                       // tiles per row
    gutter: width < 360 ? 12 : tablet ? 24 : 14, // side margin of the page
    contentMax: tablet ? 720 : 640,             // the page never stretches wider than this
    dockMax: 560,                               // the bottom dock keeps a phone-like width on tablets
    sheetMax: 560,                              // bottom sheets too
  };
}
