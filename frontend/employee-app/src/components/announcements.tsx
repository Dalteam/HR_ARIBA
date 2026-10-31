// الإعلانات والتهاني — the card of the home screen (HR's 22/10 update: announcements pinned or from the last 14 days,
// greetings of the last day: they hide themselves). Shows nothing while there is nothing to show or the list cannot be loaded.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { announcements, type Announcement } from "@/lib/api";
import { Icon } from "@/components/icons";
import { Card, CardTitle, T } from "@/components/ui";
import { useTheme } from "@/theme";

export function AnnouncementsCard() {
  const t = useTheme();
  const [items, setItems] = useState<Announcement[]>([]);
  // a greeting stays on the home screen for 24 hours at most (the server already filters; this also covers an app left open overnight)
  const DAY = 24 * 3600 * 1000;
  const load = useCallback(() => { announcements.mine().then((l) => setItems(l.filter((a) => a.kind !== "greeting" || Date.now() - new Date(a.created_at).getTime() < DAY))).catch(() => setItems([])); }, []);
  useEffect(load, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!items.length) return null;
  return (
    <Card>
      <CardTitle icon="bell">الإعلانات والتهاني</CardTitle>
      {items.slice(0, 4).map((a, i) => (
        <View key={a.id} style={{ flexDirection: "row", gap: 10, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: t.bd }}>
          <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: a.kind === "greeting" ? "rgba(228,228,188,.55)" : "rgba(1,77,61,.14)" }}>
            <Icon name={a.kind === "greeting" ? "star" : "bell"} size={18} color={a.kind === "greeting" ? "#231F20" : "#014D3D"} stroke={2} />
          </View>
          <View style={{ flex: 1 }}>
            <T size={13} weight={800}>{a.title}</T>
            {a.body ? <T size={12} color={t.mu} style={{ marginTop: 2, lineHeight: 19 }}>{a.body}</T> : null}
          </View>
        </View>
      ))}
    </Card>
  );
}
