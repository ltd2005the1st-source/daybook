"use client";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { CheckRow, CheckSheet, repeatedNotes } from "@/components/checks";
import { ChevronLeft, ChevronRight, Plus, ReceiptText } from "lucide-react";
import { useData } from "@/components/data";
import { Legend, Register } from "@/components/register";
import { MakeupStepper, StudentSheet, STUDENT_COLORS } from "@/components/student-sheet";
import { Dot, Field, Page, PageHeader, Section, Segmented, Sheet, Tick } from "@/components/ui";
import { fmtMonth, monthOf, relDay, shiftMonth, today } from "@/lib/dates";
import { parseAmount, vnd } from "@/lib/format";
import { checkTasksBetween, makeupsOwed, mergeChecks, nextLesson, taughtIn } from "@/lib/teaching";
import type { Student } from "@/lib/types";
import { Money } from "@/components/rolling";
import { RegisterNotes } from "@/components/register-notes";

/** Homework checks show today and the three days after it. */
const CHECK_DAYS = 4;

export default function TeachingPage() {
  const { store, update } = useData();
  const [month, setMonth] = useState(monthOf(today()));
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const students = useMemo(() => store.students.filter((s) => s.active).sort((a, b) => a.sort - b.sort), [store.students]);
  const pickedStudent = store.students.find((s) => s.id === picked) ?? null;

  const pickStudent = useCallback((s: Student) => setPicked(s.id), []);
  const lessons = store.lessons;
  const { taught, earned } = useMemo(() => {
    let n = 0;
    let sum = 0;
    for (const s of students) {
      const k = taughtIn({ lessons }, s.id, month).length;
      n += k;
      sum += k * s.rate;
    }
    return { taught: n, earned: sum };
  }, [students, lessons, month]);
  const owed = students.reduce((n, s) => n + makeupsOwed(store, s), 0);
  const toCollect =
    store.receipts.filter((r) => r.status === "issued").reduce((n, r) => n + r.amount, 0) +
    store.debts.filter((d) => d.student_id && !d.settled).reduce((n, d) => n + d.amount, 0);

  // Homework still open, grouped by student, ordered by the next check.
  const t = today();
  const events = store.events;
  // Each student's next class: a two-week search, so it is worked out once per change to classes, not per render.
  const nextOf = useMemo(() => {
    const m = new Map<string, ReturnType<typeof nextLesson>>();
    for (const s of students) m.set(s.id, nextLesson(store, s.id, t));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, events, lessons, t]);
  const openHw = students
    .map((s) => ({ s, items: store.homework.filter((h) => h.student_id === s.id && h.status === "open"), next: nextOf.get(s.id) }))
    .filter((x) => x.items.length)
    .sort((a, b) => (a.next?.date ?? "9").localeCompare(b.next?.date ?? "9"));

  // Everything to check from today through the next four days (a rolling window, not the week).
  const checks = mergeChecks(checkTasksBetween(store, t, CHECK_DAYS).filter((c) => !c.done));
  // Show a repeated check note only on the soonest check for that student.
  const sameNote = repeatedNotes(checks);
  const [openCheck, setOpenCheck] = useState<{ studentId: string; date: string } | null>(null);

  return (
    <Page wide>
      <PageHeader eyebrow="Teaching" title="The register">
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" className="btn btn-ghost px-1.5" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={17} />
          </button>
          <span className="min-w-[128px] text-center text-[14px] font-medium">{fmtMonth(month)}</span>
          <button aria-label="Next month" className="btn btn-ghost px-1.5" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={17} />
          </button>
        </div>
        <Link href="/teaching/receipts" className="btn btn-line">
          <ReceiptText size={15} /> Receipts
        </Link>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={15} /> Student or class
        </button>
      </PageHeader>

      <p className="mb-5 text-[15px] text-ink-2 leading-relaxed">
        <span className="num font-semibold text-ink">{taught}</span> sessions taught in {fmtMonth(month).split(" ")[0]} for{" "}
        <Money value={earned} className="num font-semibold text-ink" />.{" "}
        {owed > 0 ? (
          <>
            You have noted <span className="num font-semibold text-pen">{owed}</span> makeup {owed === 1 ? "session" : "sessions"} left
          </>
        ) : (
          "No makeups left"
        )}
        {toCollect > 0 && (
          <>
            {" "}and have <Money value={toCollect} className="num font-semibold text-ink" /> to collect
          </>
        )}
        .
      </p>

      <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Register month={month} students={students} onPickStudent={pickStudent} />
          <div className="mt-3">
            <Legend />
          </div>
        </div>

        <aside className="min-w-0">
          <Section title="Notes">
            <RegisterNotes />
          </Section>

          <Section title="Homework checks" action={<span className="text-[12px] text-muted">Next 4 days</span>}>
            {checks.length === 0 && <p className="text-[13.5px] text-muted">No checks in the next four days.</p>}
            <div className="row-list flex flex-col overflow-x-clip">
              <AnimatePresence initial={false}>
                {checks.map((c) => (
                  <CheckRow key={c.key} c={c} hideNote={sameNote.has(c.key)} compact onOpen={() => setOpenCheck({ studentId: c.student.id, date: c.date })} />
                ))}
              </AnimatePresence>
            </div>
            <p className="mt-1 text-[12px] text-muted">One before each class, at 22:30 the night before unless you move it on the Calendar. Tap one to change what to check.</p>
          </Section>

          <Section title="Homework to check">
            {openHw.length === 0 && <p className="text-[13.5px] text-muted">Nothing waiting. Log homework from a student’s page.</p>}
            <div className="flex flex-col gap-4">
              {openHw.map(({ s, items, next }) => (
                <div key={s.id}>
                  <button onClick={() => setPicked(s.id)} className="mb-1 flex w-full items-center gap-2 text-left">
                    <Dot color={s.color} />
                    <span className="text-[13.5px] font-semibold">{s.name}</span>
                    {next && <span className="ml-auto text-[12px] text-muted">class {relDay(next.date).toLowerCase()}</span>}
                  </button>
                  {items.map((h) => (
                    <div key={h.id} className="flex items-start gap-2.5 py-1 pl-0.5">
                      <Tick checked={false} color="var(--pen)" size={16} label="Mark checked" onChange={() => update("homework", h.id, { status: "checked", checked_on: today() })} />
                      <span className="text-[13.5px] leading-snug">{h.title}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Students">
            <div className="flex flex-col">
              {students.map((s) => {
                const nl = nextOf.get(s.id);
                const o = makeupsOwed(store, s);
                return (
                  <div key={s.id} role="button" tabIndex={0} onClick={() => setPicked(s.id)} onKeyDown={(e) => e.key === "Enter" && setPicked(s.id)} className="row flex cursor-pointer items-center gap-3 py-2 text-left hover:bg-hover">
                    <Dot color={s.color} size={10} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">
                        {s.name}
                        {s.kind === "class" && <span className="ml-1.5 text-[12px] font-normal text-muted">{s.members.join(", ")}</span>}
                      </div>
                      <div className="text-[12px] text-muted">
                        {nl ? `Next ${relDay(nl.date).toLowerCase()} ${nl.start}` : "No upcoming class"}

                      </div>
                    </div>
                    <span className="flex flex-col items-end gap-1">
                      <span className="num text-[12.5px] text-ink-2">{vnd(s.rate, { compact: true })}</span>
                      <span className="flex items-center gap-1 text-[11px] text-muted">
                        makeups <MakeupStepper s={s} compact />
                      </span>
                    </span>
                  </div>
                );
              })}
              {store.students.some((s) => !s.active) && (
                <div className="mt-2 text-[12px] text-muted">
                  Inactive:{" "}
                  {store.students
                    .filter((s) => !s.active)
                    .map((s) => (
                      <button key={s.id} className="underline underline-offset-2 mr-2" onClick={() => setPicked(s.id)}>
                        {s.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </Section>
        </aside>
      </div>

      <StudentSheet student={pickedStudent} onClose={() => setPicked(null)} />
      <AddStudent open={adding} onClose={() => setAdding(false)} onCreated={(s) => setPicked(s.id)} count={store.students.length} />
      <CheckSheet at={openCheck} onClose={() => setOpenCheck(null)} />
    </Page>
  );
}

function AddStudent({ open, onClose, onCreated, count }: { open: boolean; onClose: () => void; onCreated: (s: Student) => void; count: number }) {
  const { insert } = useData();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"student" | "class">("student");
  const [rate, setRate] = useState("400k");
  return (
    <Sheet open={open} onClose={onClose} title="New student or class">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const s = insert("students", {
            name: name.trim(),
            kind,
            members: [],
            color: STUDENT_COLORS[count % STUDENT_COLORS.length],
            rate: parseAmount(rate) ?? 0,
            makeup_baseline: 0,
            active: true,
            check_mode: "night_before",
            check_time: "22:30",
            check_days: [],
            check_minutes: 60,
            remind_before: [40, 20],
            availability: null,
            note: null,
            sort: count,
          });
          setName("");
          onClose();
          onCreated(s);
        }}
      >
        <Segmented
          className="mb-3"
          value={kind}
          onChange={setKind}
          options={[
            { value: "student", label: "One student" },
            { value: "class", label: "Group class" },
          ]}
        />
        <Field label="Name">
          <input autoFocus className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "class" ? "leWeekend" : "Student name"} />
        </Field>
        <Field label="Rate per session">
          <input className="field num" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="400k" />
        </Field>
        <button className="btn btn-primary w-full justify-center py-2">Create</button>
      </form>
    </Sheet>
  );
}
