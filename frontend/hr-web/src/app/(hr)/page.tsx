import { redirect } from "next/navigation";

// proxy.ts sends "/" to the right home for the signed-in role; this is only a fallback.
export default function Home() {
  redirect("/dashboard");
}
