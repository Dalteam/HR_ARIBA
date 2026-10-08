"use client";

import { PageState } from "@/components/hr/not-built";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageState error={error.message} onRetry={() => retry()} />;
}
