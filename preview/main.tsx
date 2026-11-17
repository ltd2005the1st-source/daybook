// Preview build: the real app in local mode, routed by hash, bundled into one HTML file.
import { createRoot } from "react-dom/client";
import { DataProvider } from "@/components/data";
import { Shell } from "@/components/shell";
import { usePathname } from "next/navigation";
import TodayPage from "@/app/(app)/page";
import CalendarPage from "@/app/(app)/calendar/page";
import TasksPage from "@/app/(app)/tasks/page";
import TeachingPage from "@/app/(app)/teaching/page";
import ReceiptsPage from "@/app/(app)/teaching/receipts/page";
import ReceiptView from "@/app/(app)/teaching/receipts/[id]/page";
import MoneyPage from "@/app/(app)/money/page";
import HabitsPage from "@/app/(app)/habits/page";
import SettingsPage from "@/app/(app)/settings/page";
import MusicPage from "@/app/(app)/music/page";

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
  if (path === "/calendar") return <CalendarPage />;
  if (path === "/tasks") return <TasksPage />;
  if (path === "/teaching") return <TeachingPage />;
  if (path === "/teaching/receipts") return <ReceiptsPage />;
  if (path.startsWith("/teaching/receipts/")) return <ReceiptView params={receiptParams(path.split("/").pop()!)} />;
  if (path === "/money") return <MoneyPage />;
  if (path === "/habits") return <HabitsPage />;
  if (path === "/settings") return <SettingsPage />;
  if (path === "/music") return <MusicPage />;
  return <TodayPage />;
}

createRoot(document.getElementById("root")!).render(
  <DataProvider>
    <Shell>
      <Routes />
    </Shell>
  </DataProvider>,
);
