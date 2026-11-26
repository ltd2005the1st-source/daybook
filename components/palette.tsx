"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckSquare } from "lucide-react";
import { Command, CommandDialog, CommandDialogPopup, CommandEmpty, CommandInput, CommandItem, CommandList, CommandPanel, CommandShortcut } from "@/components/ui/command";
import { useData } from "./data";
import { NAV, sectionOf } from "./nav";
import { scrollToSection } from "./scroll-spy";
import { today } from "@/lib/dates";
import { fold } from "@/lib/format";
import { describeTask, duplicateTask } from "@/lib/dupes";

type Item = { id: string; label: string; hint?: string; icon: React.ComponentType<{ size?: number }>; run: () => void };

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { insert, store, toast } = useData();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) {
      setQ("");
    }
  }, [open]);

  const go = (href: string) => () => {
    // On the dashboard, sections are a glide away; anything else is its own page.
    const id = sectionOf(href);
    if (id && document.querySelector("[data-dashboard]")) scrollToSection(id);
    else router.push(href);
    onClose();
  };
  const nav: Item[] = [
    ...NAV.map((n) => ({ id: n.href, label: n.label, hint: "Go to", icon: n.icon, run: go(n.href) })),
    { id: "/teaching/receipts", label: "Receipts", hint: "Go to", icon: NAV[3].icon, run: go("/teaching/receipts") },
    { id: "/settings", label: "Settings", hint: "Go to", icon: NAV[0].icon, run: go("/settings") },
    ...store.students.map((s) => ({ id: `s${s.id}`, label: s.name, hint: "Student", icon: NAV[3].icon, run: go("/teaching") })),
  ];
  const filtered = q ? nav.filter((n) => fold(n.label).includes(fold(q))) : nav.slice(0, 8);
  const items: Item[] = q
    ? [
        ...filtered,
        {
          id: "task",
          label: `Add task: “${q}”`,
          icon: CheckSquare,
          run: () => {
            const dup = duplicateTask(store, q);
            if (dup) {
              toast(describeTask(dup) + " Not added again.");
              onClose();
              return;
            }
            insert("tasks", { title: q, notes: null, list: "Personal", due_on: today(), due_time: null, priority: false, horizon: "now", done: false, done_at: null, sort: store.tasks.length });
            toast(`Task added: ${q}`);
            onClose();
          },
        },
      ]
    : filtered;

  return (
    <CommandDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <CommandDialogPopup>
        <Command
          items={items}
          filter={null}
          value={q}
          onValueChange={(v: string) => setQ(v)}
          itemToStringValue={(it: unknown) => (it as Item).label}
        >
          <CommandInput placeholder="Go somewhere, add a task" />
          <CommandPanel>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandList>
              {(it: Item) => (
                <CommandItem key={it.id} value={it} onClick={it.run} className="gap-2.5">
                  <it.icon size={16} />
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <CommandShortcut>{it.hint}</CommandShortcut>}
                </CommandItem>
              )}
            </CommandList>
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
