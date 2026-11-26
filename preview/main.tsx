// Preview build: the real app in local mode, routed by hash, bundled into one HTML file.
import { createRoot } from "react-dom/client";
import { DataProvider } from "@/components/data";
import { Shell } from "@/components/shell";
import { SmoothCursor } from "@/components/smooth-cursor";
import { usePathname } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import ReceiptsPage from "@/app/(app)/teaching/receipts/page";
import ReceiptView from "@/app/(app)/teaching/receipts/[id]/page";
import SettingsPage from "@/app/(app)/settings/page";

const params = new Map<string, Promise<{ id: string }>>();
function receiptParams(id: string) {
  if (!params.has(id)) {
    const p = Promise.resolve({ id }) as Promise<{ id: string }> & { status?: string; value?: unknown };
    p.status = "fulfilled";
    p.value = { id };
    params.set(id, p);
  }
  return params.get(id)!;
}

function Routes() {
  const path = usePathname();
  if (path === "/teaching/receipts") return <ReceiptsPage />;
  if (path.startsWith("/teaching/receipts/")) return <ReceiptView params={receiptParams(path.split("/").pop()!)} />;
  if (path === "/settings") return <SettingsPage />;
  // #today, #calendar, #tasks … are all spots on the one dashboard page.
  return <Dashboard />;
}

createRoot(document.getElementById("root")!).render(
  <DataProvider>
    <Shell>
      <Routes />
    </Shell>
    <SmoothCursor />
  </DataProvider>,
);
