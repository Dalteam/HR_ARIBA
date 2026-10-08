import { useFonts } from "expo-font";
import { Redirect, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/notifications";
import { Loading } from "@/components/ui";
import { fonts } from "@/theme";

function Gate() {
  const { user, ready } = useAuth();
  const segments = useSegments();
  if (!ready) return <Loading />;

  const screen = segments[0];
  if (!user && screen !== "login") return <Redirect href="/login" />;
  if (user?.must_change_password && screen !== "change-password") return <Redirect href="/change-password" />;
  if (user && !user.must_change_password && (screen === "login" || screen === "change-password"))
    return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    [fonts.light]: require("../assets/fonts/ARIBA_TWO_LIGHT.ttf"),
    [fonts.medium]: require("../assets/fonts/ARIBA_TWO_MEDIUM.ttf"),
    [fonts.bold]: require("../assets/fonts/ARIBA_TWO_BOLD.ttf"),
  });
  if (!loaded) return <Loading />;
  return (
    <AuthProvider>
      <NotificationsProvider>
        <StatusBar style="auto" />
        <Gate />
      </NotificationsProvider>
    </AuthProvider>
  );
}
