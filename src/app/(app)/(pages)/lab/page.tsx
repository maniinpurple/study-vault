import type { Metadata } from "next";

import { LabStudio } from "@/components/lab/lab-studio";
import { VaultGate } from "@/components/vault-gate";

export const metadata: Metadata = { title: "AI Practice Lab" };

export default function LabPage() {
  return (
    <VaultGate>
      <LabStudio />
    </VaultGate>
  );
}
