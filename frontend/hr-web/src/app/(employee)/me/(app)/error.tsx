"use client";

import { MeState } from "@/components/me/me-shell";

export default function Error({ error }: { error: Error & { digest?: string }; retry: () => void }) {
  return <MeState error={error.message} />;
}
