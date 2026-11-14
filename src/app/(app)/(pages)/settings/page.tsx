import type { Metadata } from "next";

import { SettingsView } from "@/components/settings-view";
import { VaultGate } from "@/components/vault-gate";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <VaultGate>
      <SettingsView />
    </VaultGate>
  );
}
