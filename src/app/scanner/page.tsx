import type { Metadata } from "next";

import { ScannerStudio } from "@/components/scanner/scanner-studio";
import { VaultGate } from "@/components/vault-gate";

export const metadata: Metadata = { title: "Exam Scanner" };

export default function ScannerPage() {
  return (
    <VaultGate>
      <ScannerStudio />
    </VaultGate>
  );
}
