// Their SigPad (a canvas the employee signs on) for React Native: strokes drawn with the finger, kept as an SVG.
// onChange receives an SVG data URL (placed as <img> in the letter / form HTML) or "" when cleared.
import { useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Btn } from "@/components/ui";

const W = 600, H = 180;

export function toSvgDataUrl(paths: string[]): string {
  if (!paths.length) return "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`
    + paths.map((d) => `<path d="${d}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join("")
    + "</svg>";
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export function SigPad({ onChange, onDrawing }: { onChange: (dataUrl: string) => void; onDrawing?: (active: boolean) => void }) {
  const [paths, setPaths] = useState<string[]>([]);
  const pathsRef = useRef<string[]>([]);
  const cur = useRef("");
  const box = useRef({ w: 1, h: 1 });
  const [live, setLive] = useState("");
  const pt = (x: number, y: number) => `${((x * W) / box.current.w).toFixed(1)},${((y * H) / box.current.h).toFixed(1)}`;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    // the sheet around the pad scrolls: keep the stroke instead of handing the finger to the scroll view
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (e) => { onDrawing?.(true); cur.current = "M" + pt(e.nativeEvent.locationX, e.nativeEvent.locationY); setLive(cur.current); },
    onPanResponderMove: (e) => { cur.current += " L" + pt(e.nativeEvent.locationX, e.nativeEvent.locationY); setLive(cur.current); },
    onPanResponderTerminate: () => { cur.current = ""; setLive(""); onDrawing?.(false); },
    onPanResponderRelease: () => {
      onDrawing?.(false);
      const done = cur.current;
      cur.current = "";
      setLive("");
      // onChange updates the parent: call it here, not inside the setState updater (React: "Cannot update a component while rendering a different one")
      const n = done ? [...pathsRef.current, done] : pathsRef.current;
      pathsRef.current = n;
      setPaths(n);
      onChange(toSvgDataUrl(n));
    },
  })).current;
  const onLayout = (e: LayoutChangeEvent) => { box.current = { w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 }; };
  return (
    <View>
      <View onLayout={onLayout} {...pan.panHandlers}
        style={{ height: 160, borderWidth: 1, borderStyle: "dashed", borderColor: "#888", borderRadius: 8, backgroundColor: "#fff", touchAction: "none", userSelect: "none" }}>
        {/* touches land on the pad, never on a stroke: locationX/Y are then relative to the pad, not to the stroke under the finger */}
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ pointerEvents: "none" }}>
          {[...paths, live].filter(Boolean).map((d, i) => (
            <Path key={i} d={d} fill="none" stroke="#111" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </View>
      <Btn kind="ghost" title="مسح التوقيع" onPress={() => { pathsRef.current = []; setPaths([]); onChange(""); }} style={{ marginTop: 6 }} />
    </View>
  );
}
