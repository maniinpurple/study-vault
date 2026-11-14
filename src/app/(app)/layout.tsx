import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";

/** The signed-in application: data provider + sidebar shell. Sign-in and registration live outside it, in (auth). */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
