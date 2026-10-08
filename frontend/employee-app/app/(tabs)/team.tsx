// فريقي + الموافقات — legacy main/10-team-manager-approvals.js + secure workflow (ariba_staff_queue / ariba_workflow_action).
import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Card, ErrorText, Txt } from "@/components/ui";
import { ApiError, requests, type MyRequest, type TeamMember } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { requestDetail, statusText, typeName } from "@/lib/labels";
import { fonts, useTheme } from "@/theme";

const APPROVER_ROLES = ["manager", "hr", "ceo", "admin"];

export default function Team() {
  const t = useTheme();
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [queue, setQueue] = useState<MyRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tm, q] = await Promise.all([requests.team(), requests.approvals()]);
      setTeam(tm);
      setQueue(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل البيانات");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function decide(r: MyRequest, action: "approve" | "reject") {
    if (action === "reject" && !reason.trim()) {
      Alert.alert("❌", "اكتب سبب الرفض");
      return;
    }
    setBusy(r.id);
    try {
      await requests.decide(r.id, action, action === "reject" ? reason.trim() : undefined);
      Alert.alert(action === "approve" ? "✅ تمت الموافقة وانتقل الطلب للمرحلة التالية" : "❌ تم رفض الطلب");
      setRejecting(null);
      setReason("");
      await load();
    } catch (e) {
      Alert.alert("❌", e instanceof ApiError ? e.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(null);
    }
  }

  const showApprovals = queue.length > 0 || APPROVER_ROLES.includes(user?.role ?? "") || team.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <ErrorText message={error} />
      <Card title="👥 فريقي">
        {!team.length ? <Txt muted style={{ textAlign: "center", padding: 16 }}>لم يتم تحديد موظفين تحت إدارتك.</Txt> : null}
        {team.map((m) => (
          <View key={m.id} style={[styles.member, { borderBottomColor: t.bd }]}>
            <View style={[styles.avatar, { backgroundColor: t.bl + "22" }]}>
              <Txt bold style={{ color: t.bl }}>{m.name_ar.charAt(0)}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt bold style={{ fontSize: 12 }}>{m.name_ar}</Txt>
              <Txt muted style={{ fontSize: 10 }}>{m.job_title ?? m.emp_no}</Txt>
            </View>
          </View>
        ))}
      </Card>

      {showApprovals ? (
        <Card title={`✅ الموافقات${queue.length ? ` (${queue.length})` : ""}`}>
          <Txt muted style={{ fontSize: 11, marginBottom: 8 }}>
            الموظف → المدير المباشر → الموارد البشرية → الرئيس التنفيذي → الموظف
          </Txt>
          {!queue.length ? <Txt muted style={{ textAlign: "center", padding: 16 }}>لا توجد طلبات بانتظار موافقتك</Txt> : null}
          {queue.map((r) => (
            <View key={r.id} style={[styles.item, { borderBottomColor: t.bd }]}>
              <View style={styles.between}>
                <Txt bold style={{ fontSize: 12 }}>{r.employee_name} — {typeName(r.type)}</Txt>
                <Txt style={{ fontSize: 10, color: t.am }}>{statusText(r).text}</Txt>
              </View>
              <Txt muted style={{ fontSize: 11, marginTop: 4 }}>{requestDetail(r)}</Txt>
              {r.notes ? <Txt style={{ fontSize: 10, color: t.dm, marginTop: 3 }}>{r.notes}</Txt> : null}
              {rejecting === r.id ? (
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="سبب الرفض"
                  placeholderTextColor={t.dm}
                  style={[styles.input, { borderColor: t.bd, backgroundColor: t.c2, color: t.tx, fontFamily: fonts.medium }]}
                />
              ) : null}
              <View style={styles.actions}>
                <Pressable disabled={busy === r.id} onPress={() => decide(r, "approve")} style={[styles.act, { backgroundColor: t.gr }]}>
                  <Txt bold style={{ color: "#fff" }}>موافقة</Txt>
                </Pressable>
                <Pressable
                  disabled={busy === r.id}
                  onPress={() => (rejecting === r.id ? decide(r, "reject") : (setRejecting(r.id), setReason("")))}
                  style={[styles.act, { backgroundColor: t.rd }]}
                >
                  <Txt bold style={{ color: "#fff" }}>{rejecting === r.id ? "تأكيد الرفض" : "رفض"}</Txt>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  member: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8, textAlign: "right" },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  act: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
});
