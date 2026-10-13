// Forced password change (legacy 024) — the same white modal, shown before the app until the password is changed.
import { View } from "react-native";
import { PasswordSheet } from "@/components/password-sheet";
import { useTheme } from "@/theme";

export default function ChangePassword() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PasswordSheet visible forced onClose={() => {}} />
    </View>
  );
}
