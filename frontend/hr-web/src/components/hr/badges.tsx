import { translate, type Lang } from "@/lib/i18n/locale";

/** Prototype `dBadge(d)`: "—" when unknown, منتهي when past, red <= 30, amber <= 90, green otherwise. */
export function DaysBadge({ days, lang }: { days: number | null; lang: Lang }) {
  if (days === null || days === undefined) return <span className="b bk">—</span>;
  if (days <= 0) return <span className="b br">{translate(lang, "common.expired")}</span>;
  const label = lang === "ar" ? `${days}ي` : `${days}d`;
  if (days <= 30) return <span className="b br">{label}</span>;
  if (days <= 90) return <span className="b ba">{label}</span>;
  return <span className="b bg">{label}</span>;
}
