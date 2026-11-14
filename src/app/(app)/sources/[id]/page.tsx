import type { Metadata } from "next";
import { Suspense } from "react";

import { SourceWorkspace } from "@/components/sources/source-workspace";
import { VaultGate } from "@/components/vault-gate";

export const metadata: Metadata = { title: "Source" };

/** Param values are runtime data under Cache Components, so access sits behind a Suspense boundary. */
export default function SourcePage({ params }: PageProps<"/sources/[id]">) {
  return (
    <Suspense fallback={null}>
      {params.then(({ id }) => (
        <VaultGate>
          <SourceWorkspace key={id} sourceId={id} />
        </VaultGate>
      ))}
    </Suspense>
  );
}
