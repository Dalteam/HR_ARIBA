"use client";

import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale";

// «تطبيق الموظف» — where an employee who signs in on the HR portal is sent.
//
// The employee's screens (home, attendance, leaves, salary, profile, team, documents, overtime, approvals) live
// in the Expo app (frontend/employee-app). The web copy that used to serve them at /me has been retired — its
// pages are kept as text-only under src/legacy/employee-web and its routing is gone (lib/routes.ts). What is
// left here is one card: what happened, where the app is, and a way out of the session.
const APP_URL = process.env.NEXT_PUBLIC_EMPLOYEE_APP_URL ?? "";

const card: React.CSSProperties = {
  maxWidth: 460,
  margin: "10vh auto",
  padding: "28px 26px",
  border: "1px solid #d8d0bd",
  borderRadius: 14,
  background: "#fffdf8",
  color: "#202522",
  textAlign: "center",
  fontFamily: "inherit",
};
const button: React.CSSProperties = {
  marginTop: 18,
  padding: "10px 20px",
  border: "1px solid #d8d0bd",
  borderRadius: 10,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 14,
};

export default function EmployeeHome() {
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const { user, loading, signOut } = useAuth();

  return (
    <main style={{ minHeight: "100vh", background: "#f4f0e4" }}>
      <div style={card}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{T("تطبيق الموظف", "The employee app")}</div>
        <p style={{ fontSize: 14, lineHeight: 1.8, margin: "0 0 6px" }}>
          {T(
            "الحضور والإجازات والراتب والملف صارت في تطبيق الموظف المستقل. سجّل الدخول هناك بنفس الحساب وكلمة المرور.",
            "Attendance, leave, salary and your profile live in the employee app now. Sign in there with the same account and password.",
          )}
        </p>
        {APP_URL ? (
          <a href={APP_URL} style={{ ...button, display: "inline-block", textDecoration: "none" }}>
            {T("افتح تطبيق الموظف", "Open the employee app")}
          </a>
        ) : (
          <p style={{ fontSize: 13, color: "#56766d", margin: "6px 0 0" }}>
            {T("اطلب الرابط من الموارد البشرية.", "Ask HR for the link.")}
          </p>
        )}
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid #e6dfcf", fontSize: 13, color: "#56766d" }}>
          {!loading && user && (
            <div style={{ marginBottom: 4 }}>
              {T("أنت مسجّل الدخول باسم", "Signed in as")} <b style={{ color: "#202522" }}>{user.employee?.name_ar ?? user.username}</b>
            </div>
          )}
          <button type="button" style={button} onClick={() => void signOut()}>
            {T("تسجيل الخروج", "Sign out")}
          </button>
        </div>
      </div>
    </main>
  );
}
