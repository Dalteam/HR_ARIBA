"use client";

import { FEATURES, type FeatureId } from "@/lib/features";
import { useLocale } from "@/lib/i18n/locale";

/** A page of the updated design that waits for a later step (lib/features.ts): never sample data. */
export function PendingScreen({ id }: { id: FeatureId }) {
  const { lang } = useLocale();
  const waits = FEATURES[id].waits;
  return (
    <div className="card" id={`PENDING_${id}`}>
      <div className="al alb">
        <i className="ti ti-hourglass" aria-hidden />
        <div>
          <strong>{lang === "en" ? "Not available yet" : "غير متاح بعد"}</strong>
          {waits && (
            <div>
              {lang === "en" ? `This page opens after ${waits.en}.` : `تُفتح هذه الصفحة بعد ${waits.ar}.`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
