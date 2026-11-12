import type { Metadata } from "next";

import { ReviewArena } from "@/components/review/review-arena";
import { VaultGate } from "@/components/vault-gate";

export const metadata: Metadata = { title: "Review Arena" };

export default function ReviewPage() {
  return (
    <VaultGate>
      <ReviewArena />
    </VaultGate>
  );
}
