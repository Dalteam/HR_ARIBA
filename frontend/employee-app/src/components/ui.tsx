// Small building blocks shaped like the prototype's cards (.card), rows and buttons.
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { fonts, useTheme } from "@/theme";

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={styles.screen}>
      {children}
    </ScrollView>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.c, borderColor: t.bd }]}>
      {title ? <Txt bold style={{ marginBottom: 10, fontSize: 15 }}>{title}</Txt> : null}
      {children}
    </View>
  );
}

export function Txt({
  children,
  bold,
  muted,
  style,
}: {
  children: ReactNode;
  bold?: boolean;
  muted?: boolean;
  style?: object;
}) {
  const t = useTheme();
  return (
    <Text
      style={[
        { color: muted ? t.mu : t.tx, fontFamily: bold ? fonts.bold : fonts.medium, fontSize: 13, textAlign: "left" },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: t.bd }]}>
      <Txt muted>{label}</Txt>
      <Txt bold>{value ?? "—"}</Txt>
    </View>
  );
}

export function Button({ title, onPress, busy, kind = "primary" }: { title: string; onPress: () => void; busy?: boolean; kind?: "primary" | "danger" }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.btn, { backgroundColor: kind === "danger" ? t.rd : t.bl, opacity: pressed || busy ? 0.7 : 1 }]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { fontFamily: fonts.bold }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      <Txt muted style={{ marginBottom: 6 }}>{label}</Txt>
      <TextInput
        placeholderTextColor={t.dm}
        {...rest}
        style={[styles.input, { borderColor: t.bd, backgroundColor: t.c2, color: t.tx, fontFamily: fonts.medium }]}
      />
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
      <ActivityIndicator color={t.bl} />
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return <Text style={{ color: t.rd, fontFamily: fonts.medium, marginVertical: 8, textAlign: "left" }}>{message}</Text>;
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlign: "right" },
});
