import type { Metadata } from "next";

import { SourcesLibrary } from "@/components/sources/sources-library";
import { VaultGate } from "@/components/vault-gate";

export const metadata: Metadata = { title: "Sources" };

export default function SourcesPage() {
  return (
    <VaultGate>
      <SourcesLibrary />
    </VaultGate>
  );
}
