"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type SVGProps } from "react";
import { Reorder, useDragControls } from "motion/react";
import { ExternalLink, GripVertical, Pencil, Plus, Trash2, CalendarDays, FileText, Sheet as SheetIcon, MapPin, Languages } from "lucide-react";
import { useData } from "./data";
import { ConfirmButton, Sheet } from "./ui";
import { native } from "@/lib/native";
import { ONLINE, supabase } from "@/lib/supabase";
import { uid } from "@/lib/format";

/*
 * Shortcuts to the other apps Đạt lives in. These sites refuse to load inside another page, so
 * they're plain links that open in a new tab. In the Android app any address outside Daybook
 * opens in its own app (or the phone's browser), so nothing extra is needed there.
 *
 * The list is Đạt's to edit (add, rename, change the address, remove, reorder). Online it is kept
 * in the signed-in user's metadata, so it follows him to every device without a new table or any
 * SQL to run; in local mode it lives in localStorage. Icons are picked from the address.
 *
 * The icons are drawn here in the same 24px, 1.8 stroke line style as the lucide menu icons, so
 * they sit with the rest of the sidebar instead of as coloured logos.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
type Icon = React.ComponentType<IconProps>;

function glyph(children: React.ReactNode): Icon {
  return function AppGlyph({ size = 16, strokeWidth = 1.8, className, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={className ? `lucide ${className}` : "lucide"}
        {...rest}
      >
        {children}
      </svg>
    );
  };
}

const Messenger = glyph(
  <>
    <path d="M12 3C6.9 3 3 6.7 3 11.4c0 2.5 1.1 4.6 2.9 6.1V21l3.2-1.8c.9.3 1.9.4 2.9.4 5.1 0 9-3.7 9-8.3S17.1 3 12 3Z" />
    <path d="m7.5 13.6 3-3.2 2.3 1.9 3.7-2.4-3 3.2-2.3-1.9Z" />
  </>,
);
const Instagram = glyph(
  <>
    <rect x="3" y="3" width="18" height="18" rx="5.2" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
  </>,
);
const YouTube = glyph(
  <>
    <path d="M2.8 8.1c.2-1.6 1.4-2.8 3-2.9C7.7 5 9.8 5 12 5s4.3 0 6.2.2c1.6.1 2.8 1.3 3 2.9.2 1.3.3 2.6.3 3.9s-.1 2.6-.3 3.9c-.2 1.6-1.4 2.8-3 2.9-1.9.2-4 .2-6.2.2s-4.3 0-6.2-.2c-1.6-.1-2.8-1.3-3-2.9-.2-1.3-.3-2.6-.3-3.9s.1-2.6.3-3.9Z" />
    <path d="m10 9 5 3-5 3Z" />
  </>,
);
const Spotify = glyph(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M7.2 9.4c3.3-1 6.9-.7 9.8.9" />
    <path d="M7.8 12.4c2.7-.7 5.6-.4 7.9.9" />
    <path d="M8.4 15.2c2-.5 4.1-.3 5.9.7" />
  </>,
);
const Netlify = glyph(
  <>
    <path d="M12 3.2 20.8 12 12 20.8 3.2 12Z" />
    <path d="M8.4 12h7.2" />
    <path d="M12 3.2V8" />
    <path d="M12 16v4.8" />
  </>,
);
const Claude = glyph(
  <>
    <path d="M12 3v5.5" />
    <path d="M12 15.5V21" />
    <path d="M3 12h5.5" />
    <path d="M15.5 12H21" />
    <path d="m5.6 5.6 3.9 3.9" />
    <path d="m14.5 14.5 3.9 3.9" />
    <path d="m18.4 5.6-3.9 3.9" />
    <path d="m9.5 14.5-3.9 3.9" />
  </>,
);
const Zalo = glyph(
  <>
    <path d="M12 3.5c-5 0-9 3.5-9 7.9 0 2.3 1.1 4.4 2.9 5.8L5 20.5l3.6-1.6c1 .3 2.2.5 3.4.5 5 0 9-3.5 9-8S17 3.5 12 3.5Z" />
    <path d="M8.8 9h6.4l-6.4 5.6h6.4" />
  </>,
);
const Gmail = glyph(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.2" />
    <path d="m3.6 6.4 8.4 6.4 8.4-6.4" />
  </>,
);
const Meet = glyph(
  <>
    <rect x="3" y="6.5" width="12" height="11" rx="2.2" />
    <path d="m15 11 6-4v10l-6-4" />
  </>,
);
const Drive = glyph(
  <>
    <path d="M8.6 3.8h6.8l6.1 10.6-3.4 5.8H6l-3.4-5.8Z" />
    <path d="m8.6 3.8 6 10.6h6.9" />
    <path d="M15.4 3.8 9.3 14.4 6 20.2" />
  </>,
);

const Facebook = glyph(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.2 7.6h-1.5c-1.4 0-2.4 1-2.4 2.4V21" />
    <path d="M8.9 12.9h5.4" />
  </>,
);
const Globe = glyph(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.5 12h17" />
    <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
  </>,
);

/** An app with no drawn icon gets its first letter in a rounded square, in the same line style. */
const letters = new Map<string, Icon>();
function letterIcon(ch: string): Icon {
  let icon = letters.get(ch);
  if (!icon) {
    icon = glyph(
      <>
        <rect x="3" y="3" width="18" height="18" rx="5.2" />
        <text x="12" y="16.1" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" stroke="none" fontFamily="inherit">
          {ch}
        </text>
      </>,
    );
    letters.set(ch, icon);
  }
  return icon;
}

/** Known sites, matched against "host/path" with any leading www. removed. First match wins. */
const KNOWN: [RegExp, Icon][] = [
  [/^(m\.)?facebook\.com\/messages|^messenger\.com/, Messenger],
  [/^(m\.|web\.)?facebook\.com|^fb\.com/, Facebook],
  [/(^|\.)zalo\.me/, Zalo],
  [/(^|\.)instagram\.com/, Instagram],
  [/^mail\.google\.com|^gmail\.com/, Gmail],
  [/^meet\.google\.com/, Meet],
  [/^drive\.google\.com/, Drive],
  [/^docs\.google\.com\/spreadsheets|^sheets\.google\.com/, SheetIcon as unknown as Icon],
  [/^docs\.google\.com/, FileText as unknown as Icon],
  [/^calendar\.google\.com/, CalendarDays as unknown as Icon],
  [/^maps\.google\.com|^google\.com\/maps|^maps\.app\.goo\.gl/, MapPin as unknown as Icon],
  [/^translate\.google\.com/, Languages as unknown as Icon],
  [/(^|\.)youtube\.com|^youtu\.be/, YouTube],
  [/(^|\.)spotify\.com/, Spotify],
  [/^claude\.ai|(^|\.)anthropic\.com/, Claude],
  [/(^|\.)netlify\.com/, Netlify],
];

function siteKey(href: string): string | null {
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./, "") + u.pathname;
  } catch {
    return null;
  }
}

export function iconFor(href: string, label: string): Icon {
  const key = siteKey(href);
  if (key) for (const [re, icon] of KNOWN) if (re.test(key)) return icon;
  const ch = (label.trim() || nameFrom(href)).charAt(0).toUpperCase();
  return ch ? letterIcon(ch) : Globe;
}

/** A name to suggest from an address: "chat.zalo.me" -> "Zalo", "github.com/x" -> "Github". */
function nameFrom(href: string): string {
  const key = siteKey(normalize(href) ?? "");
  if (!key) return "";
  const parts = key.split("/")[0].split(".");
  // Skip second-level parts like the "com" in "example.com.vn".
  let i = parts.length - 2;
  while (i > 0 && /^(com|co|net|org|edu|gov|ac)$/.test(parts[i])) i--;
  const name = parts[Math.max(0, i)] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Adds https:// to bare addresses and refuses anything that isn't a web, mail or phone link. */
function normalize(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!["http:", "https:", "mailto:", "tel:"].includes(u.protocol)) return null;
    return withScheme;
  } catch {
    return null;
  }
}

// ---- The list ------------------------------------------------------------------------------

export type AppLink = { id: string; label: string; href: string };

export const DEFAULT_APPS: AppLink[] = [
  { id: "messenger", label: "Messenger", href: "https://www.facebook.com/messages" },
  { id: "zalo", label: "Zalo", href: "https://chat.zalo.me/" },
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/direct" },
  { id: "gmail", label: "Gmail", href: "https://mail.google.com/mail/u/6/#inbox" },
  { id: "meet", label: "Meet", href: "https://meet.google.com/udz-skmv-oku?pli=1&authuser=2" },
  { id: "drive", label: "Drive", href: "https://drive.google.com/drive/u/0/my-drive" },
  { id: "youtube", label: "YouTube", href: "https://www.youtube.com/" },
  { id: "spotify", label: "Spotify", href: "https://open.spotify.com/" },
  { id: "claude", label: "Claude", href: "https://claude.ai/new" },
  { id: "netlify", label: "Netlify", href: "https://app.netlify.com/teams/ltd2005the1st/projects" },
];

const CACHE_KEY = "daybook.apps.v1";
let apps: AppLink[] = DEFAULT_APPS;
let started = false;
const listeners = new Set<() => void>();

function clean(raw: unknown): AppLink[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((a): a is AppLink => !!a && typeof a.href === "string" && typeof a.label === "string")
    .map((a) => ({ id: typeof a.id === "string" && a.id ? a.id : uid(), label: a.label, href: a.href }));
}

function setApps(next: AppLink[]) {
  apps = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: keep it in memory */
  }
  listeners.forEach((f) => f());
}

/** Reads the list saved on the account. Never edited yet means the default list. */
async function refresh() {
  const { data, error } = await supabase().auth.getUser();
  if (error || !data.user) return;
  setApps(clean(data.user.user_metadata?.apps) ?? DEFAULT_APPS);
}

function start() {
  if (started) return;
  started = true;
  try {
    const cached = clean(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"));
    if (cached) setApps(cached);
  } catch {
    /* no cache */
  }
  if (!ONLINE) return;
  refresh();
  supabase().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "USER_UPDATED") setTimeout(refresh, 0);
  });
  // Picks up edits made on another device when Daybook comes back to the front.
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
}

function subscribe(f: () => void) {
  listeners.add(f);
  start();
  return () => listeners.delete(f);
}

export function useApps(): AppLink[] {
  return useSyncExternalStore(subscribe, () => apps, () => DEFAULT_APPS);
}

async function saveApps(next: AppLink[], toast: (t: string) => void) {
  const prev = apps;
  setApps(next);
  if (!ONLINE) return;
  const { error } = await supabase().auth.updateUser({ data: { apps: next } });
  if (error) {
    setApps(prev);
    toast(`Couldn't save your apps: ${error.message}`);
  }
}

/**
 * Opens every app, each in its own new tab. Browsers let one click open only one pop-up unless
 * the site is allowed to open more, so we count the tabs that didn't open and say how to fix it.
 * Hidden in the Android app, where every link leaves for another app and only one can.
 */
function useOpenAll(list: AppLink[]) {
  const { toast } = useData();
  const [can, setCan] = useState(false);
  useEffect(() => setCan(!native()), []);
  const openAll = () => {
    let blocked = 0;
    for (const a of list) {
      const w = window.open(a.href, "_blank");
      if (w) w.opener = null;
      else blocked++;
    }
    if (blocked === list.length) toast("Your browser blocked the new tabs. Allow pop-ups for Daybook (icon at the end of the address bar), then try again.");
    else if (blocked) toast(`${blocked} of ${list.length} tabs were blocked. Allow pop-ups for Daybook, then try again.`);
  };
  return can && list.length > 1 ? openAll : null;
}

/** Sidebar list: same rows as the section menu, each opening its app in a new tab. */
export function AppLinks({ onEdit }: { onEdit: () => void }) {
  const list = useApps();
  const openAll = useOpenAll(list);
  return (
    <div className="group/apps mt-4">
      <div className="flex items-center gap-1 px-2.5 pb-1 text-[11.5px] font-medium text-muted">
        <span className="flex-1">Apps</span>
        {openAll && (
          <button onClick={openAll} title="Open every app in its own tab" className="press rounded-md px-1.5 py-0.5 hover:bg-hover hover:text-ink">
            Open all
          </button>
        )}
        <button
          onClick={onEdit}
          aria-label="Edit apps"
          title="Edit apps"
          className="press -mr-1.5 inline-flex h-[22px] w-[22px] items-center justify-center rounded-md opacity-60 hover:bg-hover hover:text-ink hover:opacity-100 group-hover/apps:opacity-100 focus-visible:opacity-100"
        >
          <Pencil size={12} strokeWidth={2} />
        </button>
      </div>
      <div className="flex flex-col gap-px">
        {list.map((a) => {
          const Ico = iconFor(a.href, a.label);
          return (
            <a
              key={a.id}
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              className="press nav-item flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13.5px] text-ink-2 hover:bg-hover hover:text-ink"
            >
              <Ico size={16} />
              <span className="truncate">{a.label}</span>
            </a>
          );
        })}
        {list.length === 0 && (
          <button onClick={onEdit} className="press nav-item flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13.5px] text-muted hover:bg-hover hover:text-ink">
            <Plus size={16} strokeWidth={1.8} />
            <span>Add an app</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Phone sheet: a grid of app tiles. Tapping one opens it and closes the sheet. */
export function AppGrid({ onPick, onEdit }: { onPick?: () => void; onEdit: () => void }) {
  const list = useApps();
  const openAll = useOpenAll(list);
  return (
    <>
      {list.length > 0 ? (
        <div className="grid grid-cols-4 gap-x-2 gap-y-4 pt-2 pb-1">
          {list.map((a) => {
            const Ico = iconFor(a.href, a.label);
            return (
              <a
                key={a.id}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onPick}
                className="press flex min-w-0 flex-col items-center gap-1.5 text-[12px] text-ink-2"
              >
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-[16px] border border-line bg-sunken text-ink">
                  <Ico size={24} strokeWidth={1.7} />
                </span>
                <span className="max-w-full truncate">{a.label}</span>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="pt-2 pb-1 text-[13.5px] text-muted">No apps yet. Tap Edit to add the ones you use.</p>
      )}
      <div className="mt-4 flex gap-2">
        {openAll && (
          <button
            onClick={() => {
              openAll();
              onPick?.();
            }}
            className="btn btn-line flex-1 justify-center"
          >
            <ExternalLink size={16} strokeWidth={1.8} /> Open all
          </button>
        )}
        <button onClick={onEdit} className={`btn btn-line justify-center ${openAll ? "" : "flex-1"}`}>
          <Pencil size={15} strokeWidth={1.8} /> Edit
        </button>
      </div>
    </>
  );
}

// ---- Editing -------------------------------------------------------------------------------

/** Trims names, fixes addresses, names unnamed apps after their site, and drops empty rows. */
function tidy(draft: AppLink[]): AppLink[] {
  const out: AppLink[] = [];
  for (const a of draft) {
    const href = normalize(a.href);
    if (!href) continue;
    out.push({ id: a.id, label: a.label.trim() || nameFrom(href) || href, href });
  }
  return out;
}

const same = (a: AppLink[], b: AppLink[]) => JSON.stringify(a) === JSON.stringify(b);

/** Add, rename, change addresses, remove and drag to reorder. Saves once, when the sheet closes. */
export function AppsEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useData();
  const list = useApps();
  const [draft, setDraft] = useState<AppLink[]>(list);
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setDraft(apps);
      setFocusId(null);
    }
  }, [open]);

  const finish = () => {
    const next = tidy(draft);
    const dropped = draft.filter((a) => a.href.trim() && !normalize(a.href)).length;
    if (!same(next, apps)) saveApps(next, toast);
    if (dropped) toast(dropped === 1 ? "One address didn't look like a link, so it wasn't saved." : `${dropped} addresses didn't look like links, so they weren't saved.`);
    onClose();
  };

  const patch = (id: string, p: Partial<AppLink>) => setDraft((d) => d.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <Sheet open={open} onClose={finish} title="Edit apps" width={520}>
      <p className="mb-3 text-[13px] text-muted">Drag the handle to reorder. Changes save when you close this and show up on your other devices too.</p>
      <Reorder.Group axis="y" as="div" values={draft} onReorder={setDraft} className="flex flex-col gap-1.5">
        {draft.map((a) => (
          <EditRow
            key={a.id}
            app={a}
            autoFocus={a.id === focusId}
            onChange={(p) => patch(a.id, p)}
            onRemove={() => setDraft((d) => d.filter((x) => x.id !== a.id))}
          />
        ))}
      </Reorder.Group>
      {draft.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13.5px] text-muted">No apps. Add one below.</p>}
      <button
        onClick={() => {
          const id = uid();
          setDraft((d) => [...d, { id, label: "", href: "" }]);
          setFocusId(id);
        }}
        className="btn btn-line mt-3 w-full justify-center"
      >
        <Plus size={16} strokeWidth={1.8} /> Add app
      </button>
      <div className="mt-4 flex items-center justify-between gap-2">
        <ConfirmButton className="btn btn-ghost" confirmLabel="Tap again to reset" onConfirm={() => setDraft(DEFAULT_APPS.map((a) => ({ ...a })))}>
          Reset to default
        </ConfirmButton>
        <button onClick={finish} className="btn btn-primary">
          Done
        </button>
      </div>
    </Sheet>
  );
}

function EditRow({
  app,
  autoFocus,
  onChange,
  onRemove,
}: {
  app: AppLink;
  autoFocus: boolean;
  onChange: (p: Partial<AppLink>) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
  }, [autoFocus]);
  const Ico = iconFor(normalize(app.href) ?? "", app.label);
  const bad = app.href.trim() !== "" && !normalize(app.href);
  return (
    <Reorder.Item
      as="div"
      value={app}
      dragListener={false}
      dragControls={controls}
      transition={{ ease: [0.65, 0, 0.35, 1] }}
      whileDrag={{ scale: 1.02, boxShadow: "0 10px 30px -10px rgba(15,15,10,0.35)" }}
      className="relative flex items-center gap-2 rounded-xl border border-line bg-surface py-2 pl-1 pr-1.5"
    >
      <button
        type="button"
        aria-label={`Drag ${app.label || "app"} to reorder`}
        onPointerDown={(e) => {
          e.preventDefault();
          controls.start(e);
        }}
        className="inline-flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted hover:text-ink active:cursor-grabbing"
      >
        <GripVertical size={16} strokeWidth={1.8} />
      </button>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-sunken text-ink">
        <Ico size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          ref={nameRef}
          value={app.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={nameFrom(app.href) || "Name"}
          aria-label="Name"
          className="field text-[13.5px] font-medium"
          style={{ padding: "4px 8px" }}
        />
        <input
          value={app.href}
          onChange={(e) => onChange({ href: e.target.value })}
          placeholder="https://…"
          aria-label="Address"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="field text-[12.5px]"
          style={{ padding: "4px 8px", color: bad ? "var(--pen)" : "var(--ink-2)", borderColor: bad ? "var(--pen)" : undefined }}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${app.label || "app"}`}
        title="Remove"
        className="press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
      >
        <Trash2 size={15} strokeWidth={1.8} />
      </button>
    </Reorder.Item>
  );
}
