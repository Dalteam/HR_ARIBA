// Equal-width tiles from the measured width of their row: percentages + gaps overflow on narrow phones
// (3 x 31.6% + 2 gaps > 100%) and the third tile wraps. Width comes from onLayout, rounded down, so it fits on any phone / tablet.
import { useState } from "react";
import type { LayoutChangeEvent } from "react-native";

export function useTileWidth(cols: number, gap: number) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.floor(e.nativeEvent.layout.width));
  const tile = w > 0 ? Math.floor((w - gap * (cols - 1)) / cols) : undefined;
  return { onLayout, tile };
}
