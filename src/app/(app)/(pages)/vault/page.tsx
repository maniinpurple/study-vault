import type { Metadata } from "next";

import { VaultGate } from "@/components/vault-gate";
import { VaultView } from "@/components/vault/vault-view";

export const metadata: Metadata = { title: "Problem Vault" };

export default function VaultPage() {
  return (
    <VaultGate>
      <VaultView />
    </VaultGate>
  );
}
