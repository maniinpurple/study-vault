import type { Metadata } from "next";

import { SubjectsWorkspace } from "@/components/subjects-workspace";
import { VaultGate } from "@/components/vault-gate";

export const metadata: Metadata = { title: "Subjects" };

export default function SubjectsPage() {
  return (
    <VaultGate>
      <SubjectsWorkspace />
    </VaultGate>
  );
}
