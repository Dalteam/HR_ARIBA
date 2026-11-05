// The owner's three status icons (5 Nov 2026), in place of the ⏳ ❌ 🚫 emojis: waiting, rejected, cancelled.
// Files in public/icons/status (transparent PNGs, 128 px), drawn at the size of the text around them.

export type StatusIconName = "wait" | "rejected" | "cancelled";

export function StatusIcon({ name, size = 14 }: { name: StatusIconName; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 2 KB local icon; next/image adds nothing here
    <img src={`/icons/status/${name}.png`} alt="" aria-hidden width={size} height={size}
      style={{ display: "inline-block", verticalAlign: "-0.15em", marginInlineEnd: 4 }} />
  );
}
