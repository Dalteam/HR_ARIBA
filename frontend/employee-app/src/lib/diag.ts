// Diagnostic switches for hunting a device-only freeze: EXPO_PUBLIC_DIAG="haptics,clock,gps" turns those parts off.
// Unset in normal use.
const off = (process.env.EXPO_PUBLIC_DIAG ?? "").split(",").map((s) => s.trim());
export const diagOff = (part: "haptics" | "clock" | "gps") => off.includes(part);
