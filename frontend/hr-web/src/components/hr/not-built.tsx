"use client";

import { useLocale } from "@/lib/i18n/locale";

export function NotBuilt() {
  const { t } = useLocale();
  return (
    <div className="card">
      <div className="al alb">
        <i className="ti ti-info-circle" />
        <div>
          <strong>{t("common.notBuilt")}</strong>
          <div>{t("common.notBuiltHint")}</div>
        </div>
      </div>
    </div>
  );
}

export function PageState({ loading, error, onRetry }: { loading?: boolean; error?: string | null; onRetry?: () => void }) {
  const { t } = useLocale();
  if (loading) return <div style={{ padding: 20, textAlign: "center", color: "var(--mu)" }}>{t("common.loading")}</div>;
  if (error)
    return (
      <div className="al alr">
        <i className="ti ti-alert-triangle" />
        <div>
          {error}{" "}
          {onRetry && (
            <button type="button" className="btn bsm" onClick={onRetry}>
              {t("common.retry")}
            </button>
          )}
        </div>
      </div>
    );
  return null;
}
