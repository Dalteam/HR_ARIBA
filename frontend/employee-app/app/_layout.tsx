import { useEffect } from "react";
import { useFonts } from "expo-font";
import { Redirect, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import "@/lib/web-alert";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DataProvider } from "@/lib/data";
import { NotificationsProvider } from "@/lib/notifications";
import { Loading, ToastProvider } from "@/components/ui";
import { fonts, ThemeProvider, useTheme } from "@/theme";
import { LangProvider } from "@/i18n";

// The layout direction follows the language (src/i18n): Arabic is right-to-left. Before the saved language is read the web page starts right-to-left.
if (Platform.OS === "web" && typeof document !== "undefined") document.documentElement.dir = "rtl";

function Gate() {
  const { user, ready } = useAuth();
  const t = useTheme();
  const segments = useSegments();
  // Web (installed PWA): the strip behind the clock / status bar and the browser's theme colour follow the app's own theme
  // (light, dark or the employee's own choice), so the app looks like one screen from edge to edge.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.style.backgroundColor = t.bg;
    document.body.style.backgroundColor = t.bg;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t.bg));
  }, [t.bg]);
  if (!ready) return <Loading />;

  const screen = segments[0];
  if (!user && screen !== "login") return <Redirect href="/login" />;
  if (user?.must_change_password && screen !== "change-password") return <Redirect href="/change-password" />;
  if (user && !user.must_change_password && (screen === "login" || screen === "change-password"))
    return <Redirect href="/" />;

  return (
    <>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    [fonts.light]: require("../assets/fonts/ARIBA_TWO_LIGHT.ttf"),
    [fonts.medium]: require("../assets/fonts/ARIBA_TWO_MEDIUM.ttf"),
    [fonts.bold]: require("../assets/fonts/ARIBA_TWO_BOLD.ttf"),
  });
  if (!loaded) return null;
  return (
    <LangProvider>
    <ThemeProvider>
      <AuthProvider>
        <NotificationsProvider>
          <ToastProvider>
            <DataProvider>
              <Gate />
            </DataProvider>
          </ToastProvider>
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
    </LangProvider>
  );
}
