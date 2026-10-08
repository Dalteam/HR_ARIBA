"use client";

import { useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError, type TerminationArticle } from "@/lib/api";
import { terminateEmployee } from "@/lib/employees";
import { todayIso } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale";
import { Modal } from "./modal";

// Same article list and order as the prototype's EOS page.
const ARTICLES: TerminationArticle[] = ["art_84", "art_74", "art_85", "art_75", "art_77", "art_80", "art_53", "art_74_retirement", "art_74_death"];

export function TerminateModal({ id, name, onClose, onDone }: { id: string; name: string; onClose: () => void; onDone: () => void }) {
  const { t, tEnum } = useLocale();
  const toast = useToast();
  const [date, setDate] = useState(todayIso());
  const [article, setArticle] = useState<TerminationArticle>("art_84");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await terminateEmployee(id, { termination_date: date, article, reason: reason || null });
      toast(t("term.done"), "ok");
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("common.error"), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("term.title", { name })}
      width={460}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn brl" onClick={save} disabled={busy}>{t("term.confirm")}</button>
        </>
      }
    >
      <div className="fg">
        <div><label htmlFor="td">{t("term.date")}</label><input id="td" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div>
          <label htmlFor="ta">{t("term.article")}</label>
          <select id="ta" value={article} onChange={(e) => setArticle(e.target.value as TerminationArticle)}>
            {ARTICLES.map((a) => <option key={a} value={a}>{tEnum("termination_article", a)}</option>)}
          </select>
        </div>
        <div className="ff"><label htmlFor="tr">{t("term.reason")}</label><textarea id="tr" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
