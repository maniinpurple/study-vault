import { Dashboard } from "@/components/dashboard";
import { VaultGate } from "@/components/vault-gate";

export default function Home() {
  return (
    <VaultGate>
      <Dashboard />
    </VaultGate>
  );
}
