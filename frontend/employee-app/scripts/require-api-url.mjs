// FOLLOW_UPS #19: the web build (Railway runs `npm run build:web`) stops here unless EXPO_PUBLIC_API_URL names the
// backend this app must talk to. Expo inlines the value at build time, so a build without it would ship an app
// that cannot reach any server; before this guard it silently reached the old production host instead.
const url = (process.env.EXPO_PUBLIC_API_URL || "").trim();
if (!/^https?:\/\/[^/\s]+/.test(url)) {
  console.error(
    "\n  EXPO_PUBLIC_API_URL is not set (or is not an http(s) URL).\n" +
      "  Set it to the backend's public address without /api/v1, e.g.\n" +
      "    EXPO_PUBLIC_API_URL=https://<backend>.up.railway.app\n",
  );
  process.exit(1);
}
console.log(`EXPO_PUBLIC_API_URL = ${url}`);
