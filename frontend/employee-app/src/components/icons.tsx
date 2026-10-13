// Line icons of the legacy employee app (V118 inline SVGs, tabler-style: 24×24, round caps).
import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";

type P = { size?: number; color: string; stroke?: number };

const paths: Record<string, string[]> = {
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5", "M10 21v-6h4v6"],
  clock: ["M12 7v5l3 2"],
  calendar: ["M16 3v4", "M8 3v4", "M4 11h16"],
  cash: ["M6 12h.01", "M18 12h.01"],
  users: ["M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2", "M16 3.13a4 4 0 0 1 0 7.75", "M21 21v-2a4 4 0 0 0-3-3.85"],
  user: ["M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"],
  stopwatch: ["M12 9v4l2 2", "M10 2h4", "M12 2v3", "M19 6l1.5-1.5"],
  file: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6", "M9 17h4"],
  checks: ["M7 12l5 5L22 7", "M2 12l5 5m5-5 5-5"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
  key: ["M15 7a3 3 0 1 1-3 3", "M12 10 3 19v2h3l1-1v-2h2v-2h2l1.5-1.5"],
  logout: ["M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2", "M9 12h12", "M18 9l3 3-3 3"],
  refresh: ["M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4", "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"],
  pin: ["M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"],
  fingerprint: ["M18.9 7a8 8 0 0 1 1.1 5v1a6 6 0 0 0 .8 3", "M8 11a4 4 0 0 1 8 0v1a10 10 0 0 0 2 6", "M12 11v2a14 14 0 0 0 2.5 8",
    "M8 15a18 18 0 0 0 1.8 6", "M4.9 19a22 22 0 0 1-.9-7v-1a8 8 0 0 1 12-6.95"],
  exit: ["M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2", "M9 12h12", "M18 9l3 3-3 3"],
  checkCircle: ["M8 12.5l2.7 2.7L16.5 9.5"],
  xCircle: ["M9 9l6 6M15 9l-6 6"],
  flag: ["M5 21V4", "M5 4h11l-2 4 2 4H5"],
  building: ["M3 21h18", "M5 21V7l8-4v18", "M19 21V11l-6-4", "M9 9v.01", "M9 12v.01", "M9 15v.01", "M9 18v.01"],
  wallet: ["M17 8V5a1 1 0 0 0-1-1H6a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6", "M20 12v4h-4a2 2 0 0 1 0-4h4"],
  send: ["M10 14 21 3", "M21 3l-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3"],
  eye: ["M10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0", "M21 12c-2.4 4-5.4 6-9 6s-6.6-2-9-6c2.4-4 5.4-6 9-6s6.6 2 9 6"],
  check: ["M5 12l5 5L20 7"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12", "M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"],
  history: ["M12 8v4l2 2", "M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"],
  bank: ["M3 21h18", "M3 10h18", "M5 6l7-3 7 3", "M4 10v11", "M20 10v11", "M8 14v3", "M12 14v3", "M16 14v3"],
  invoice: ["M14 3v4a1 1 0 0 0 1 1h4", "M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z", "M9 7h1", "M9 13h6", "M13 17h2"],
  lock: ["M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z", "M8 11V7a4 4 0 1 1 8 0v4"],
  back: ["M9 14l-4-4 4-4", "M5 10h11a4 4 0 1 1 0 8h-1"],
  search: ["M21 21l-6-6"],
  chevronLeft: ["M15 6l-6 6 6 6"],
  chevronRight: ["M9 6l6 6-6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
  chevronUp: ["M6 15l6-6 6 6"],
  alert: ["M12 9v4", "M12 17h.01", "M10.24 3.957l-8.422 14.06a1.989 1.989 0 0 0 1.7 2.983h16.845a1.989 1.989 0 0 0 1.7-2.983L13.64 3.957a1.989 1.989 0 0 0-3.4 0z"],
  clipboard: ["M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2", "M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z", "M9 12h6", "M9 16h6"],
  login: ["M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2", "M21 12H9", "M12 9l-3 3 3 3"],
  info: ["M12 9h.01", "M11 12h1v4h1"],
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, color, stroke = 1.9 }: P & { name: keyof typeof paths | "clockFace" }) {
  const common = { stroke: color, strokeWidth: stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "clock" || name === "checkCircle" || name === "xCircle" || name === "history" || name === "info" ? <Circle cx={12} cy={12} r={9} {...common} /> : null}
      {name === "stopwatch" ? <Circle cx={12} cy={13} r={8} {...common} /> : null}
      {name === "calendar" ? <Rect x={4} y={5} width={16} height={16} rx={2} {...common} /> : null}
      {name === "cash" ? <><Rect x={3} y={6} width={18} height={12} rx={2} {...common} /><Circle cx={12} cy={12} r={2.5} {...common} /></> : null}
      {name === "users" ? <Circle cx={9} cy={7} r={4} {...common} /> : null}
      {name === "search" ? <Circle cx={10} cy={10} r={7} {...common} /> : null}
      {name === "user" ? <Circle cx={12} cy={7} r={4} {...common} /> : null}
      {name === "pin" ? <Circle cx={12} cy={10} r={2.6} {...common} /> : null}
      {name === "key" ? <Circle cx={15} cy={7} r={0.5} {...common} /> : null}
      {(paths[name] ?? []).map((d, i) => <Path key={i} d={d} {...common} />)}
    </Svg>
  );
}

// ARIBA mark (two parallelograms) used as the watermark behind the punch dial.
export function AribaMark({ width, height, top, bottom, opacity }: { width: number; height: number; top: string; bottom: string; opacity: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 250 262" opacity={opacity}>
      <Polygon points="40,0 250,0 210,120 0,120" fill={top} />
      <Polygon points="40,142 250,142 210,262 0,262" fill={bottom} />
    </Svg>
  );
}
