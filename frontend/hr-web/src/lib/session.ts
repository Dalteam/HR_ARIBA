// Session tokens live in first-party cookies so that `proxy.ts` can mirror routing on the server.
// They are JS-readable (needed by the client to send the bearer token); the backend verifies
// the token on every request and never trusts anything the browser says about roles.

export const ACCESS_COOKIE = "ariba_at";
export const REFRESH_COOKIE = "ariba_rt";
export const MUST_CHANGE_COOKIE = "ariba_mcp";

const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;

function secureFlag(): string {
  return typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=strict${secureFlag()}`;
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function saveSession(accessToken: string, refreshToken: string, expiresIn: number, mustChange: boolean) {
  setCookie(ACCESS_COOKIE, accessToken, Math.max(60, expiresIn));
  setCookie(REFRESH_COOKIE, refreshToken, REFRESH_MAX_AGE);
  setMustChange(mustChange);
}

export function setMustChange(mustChange: boolean) {
  if (mustChange) setCookie(MUST_CHANGE_COOKIE, "1", REFRESH_MAX_AGE);
  else setCookie(MUST_CHANGE_COOKIE, "", 0);
}

export function clearSession() {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, MUST_CHANGE_COOKIE]) setCookie(name, "", 0);
}

export const getAccessToken = () => readCookie(ACCESS_COOKIE);
export const getRefreshToken = () => readCookie(REFRESH_COOKIE);
