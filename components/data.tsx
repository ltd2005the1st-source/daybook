"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ONLINE, supabase } from "@/lib/supabase";
import { buildSeed } from "@/lib/seed";
import { uid } from "@/lib/format";
import { migrateClasses } from "@/lib/migrate";
import { TABLES, type Store, type TableName, type Tables } from "@/lib/types";

const LOCAL_KEY = "daybook.store.v1";

const empty = (): Store => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Store;

type Toast = { id: string; text: string; undo?: () => void };

type Ctx = {
  store: Store;
  ready: boolean;
  online: boolean;
  session: Session | null;
  needsLogin: boolean;
  isEmpty: boolean;
  insert: <T extends TableName>(t: T, row: Partial<Tables[T]>) => Tables[T];
  update: <T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>) => void;
  remove: <T extends TableName>(t: T, id: string, opts?: { silent?: boolean }) => void;
  loadSeed: () => Promise<void>;
  resetLocal: () => void;
  restoreBackup: (data: Partial<Store>) => Promise<number>;
  toast: (text: string, undo?: () => void) => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  signOut: () => Promise<void>;
  storeRef: React.MutableRefObject<Store>;
};

const DataCtx = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData outside provider");
  return c;
}

function readLocal(): Store | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return migrateClasses({ ...empty(), ...JSON.parse(raw) } as Store);
  } catch {
    return null;
  }
}

function writeLocal(s: Store) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<Store>(empty);
  const storeRef = useRef<Store>(store);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const channel = useRef<BroadcastChannel | null>(null);
  /**
   * Edits not yet confirmed by the server, per "table:id". Quick repeated edits (like tapping a −/+
   * stepper) used to fire one request each: they could land out of order, and every realtime echo
   * of an older write snapped the screen back to an older value, so numbers jumped around.
   * Now each row has at most one write in flight, later edits are merged into the next one, and
   * incoming rows (realtime or refetch) are overlaid with these edits until the server has caught up.
   */
  const pending = useRef(new Map<string, { patch: Record<string, unknown>; queued: Record<string, unknown> | null; settle?: ReturnType<typeof setTimeout> }>());
  const overlay = useCallback(<R extends { id: string }>(t: string, row: R): R => {
    const p = pending.current.get(`${t}:${row.id}`);
    return p ? { ...row, ...p.patch } : row;
  }, []);

  const commit = useCallback((next: Store, broadcast = true) => {
    storeRef.current = next;
    setStore(next);
    if (!ONLINE) {
      writeLocal(next);
      if (broadcast) channel.current?.postMessage("changed");
    }
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  // Pop-ups stay up for three seconds.
  const TOAST_MS = 3000;
  const toast = useCallback(
    (text: string, undo?: () => void) => {
      const id = uid();
      setToasts((t) => [...t.slice(-2), { id, text, undo }]);
      setTimeout(() => dismissToast(id), TOAST_MS);
    },
    [dismissToast],
  );

  // ---- Local mode -------------------------------------------------------
  useEffect(() => {
    if (ONLINE) return;
    const existing = readLocal();
    const initial = existing ?? buildSeed();
    commit(initial, false);
    setReady(true);
    const bc = new BroadcastChannel("daybook");
    bc.onmessage = () => {
      const s = readLocal();
      if (s) commit(s, false);
    };
    channel.current = bc;
    return () => bc.close();
  }, [commit]);

  // ---- Online mode (Supabase) -------------------------------------------
  const loadAll = useCallback(async () => {
    const sb = supabase();
    const results = await Promise.all(
      TABLES.map((t) =>
        sb
          .from(t)
          .select("*")
          .order("created_at", { ascending: true })
          .limit(5000),
      ),
    );
    const next = empty();
    results.forEach((r, i) => {
      if (r.error) console.error(TABLES[i], r.error.message);
      (next as Record<string, unknown[]>)[TABLES[i]] = ((r.data as { id: string }[]) ?? []).map((row) => overlay(TABLES[i], row));
    });
    commit(next);
    setReady(true);
  }, [commit, overlay]);

  useEffect(() => {
    if (!ONLINE) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setNeedsLogin(!data.session);
      if (!data.session) setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setNeedsLogin(!s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ONLINE || !session) return;
    loadAll();
    const sb = supabase();
    const ch = sb.channel("daybook-sync");
    for (const t of TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (payload) => {
        const cur = storeRef.current;
        const rows = cur[t] as { id: string }[];
        let nextRows = rows;
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id: string }).id;
          nextRows = rows.filter((r) => r.id !== id);
        } else {
          const row = overlay(t, payload.new as { id: string });
          const i = rows.findIndex((r) => r.id === row.id);
          nextRows = i === -1 ? [...rows, row] : rows.map((r) => (r.id === row.id ? row : r));
        }
        commit({ ...cur, [t]: nextRows } as Store);
      });
    }
    ch.subscribe();
    // Refetch when the app comes back to the foreground (phones pause sockets).
    const onVis = () => document.visibilityState === "visible" && loadAll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      sb.removeChannel(ch);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session, loadAll, commit, overlay]);

  // ---- Mutations (optimistic, then persisted) ---------------------------
  const report = useCallback(
    (what: string, err: { message: string } | null) => {
      if (err) {
        // A missing column means the database is behind the app, not that the change itself was wrong.
        const behind = /schema cache|column .* does not exist/i.test(err.message);
        toast(behind ? `Couldn't save ${what}: your database needs the latest update SQL.` : `Couldn't save ${what}: ${err.message}`);
        if (ONLINE) loadAll();
      }
    },
    [toast, loadAll],
  );

  const insert = useCallback(
    <T extends TableName>(t: T, row: Partial<Tables[T]>): Tables[T] => {
      const full = { id: uid(), created_at: new Date().toISOString(), ...row } as Tables[T];
      const cur = storeRef.current;
      commit({ ...cur, [t]: [...(cur[t] as Tables[T][]), full] } as Store);
      if (ONLINE) {
        supabase()
          .from(t)
          .insert(full as object)
          .then(({ error }) => report(t, error));
      }
      return full;
    },
    [commit, report],
  );

  const update = useCallback(
    <T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>) => {
      const cur = storeRef.current;
      commit({
        ...cur,
        [t]: (cur[t] as Tables[T][]).map((r) => (r.id === id ? { ...r, ...patch } : r)),
      } as Store);
      if (!ONLINE) return;
      const key = `${t}:${id}`;
      const map = pending.current;
      const p = map.get(key);
      if (p) {
        clearTimeout(p.settle);
        p.patch = { ...p.patch, ...patch };
        if (p.queued) {
          p.queued = { ...p.queued, ...patch };
          return;
        }
        if (p.settle === undefined) {
          // A write is in flight: send this one when it's done.
          p.queued = { ...patch };
          return;
        }
        p.settle = undefined;
      }
      const entry = p ?? { patch: { ...patch }, queued: null };
      map.set(key, entry);
      const send = (body: Record<string, unknown>) => {
        supabase()
          .from(t)
          .update(body)
          .eq("id", id)
          .then(({ error }) => {
            if (error) {
              map.delete(key);
              report(t, error);
              return;
            }
            if (entry.queued) {
              const next = entry.queued;
              entry.queued = null;
              send(next);
              return;
            }
            // Keep overlaying for a moment so late realtime echoes of older writes can't flash back.
            entry.settle = setTimeout(() => {
              if (map.get(key) === entry) map.delete(key);
            }, 2000);
          });
      };
      send({ ...patch });
    },
    [commit, report],
  );

  const remove = useCallback(
    <T extends TableName>(t: T, id: string, opts: { silent?: boolean } = {}) => {
      const cur = storeRef.current;
      const victim = (cur[t] as Tables[T][]).find((r) => r.id === id);
      commit({ ...cur, [t]: (cur[t] as Tables[T][]).filter((r) => r.id !== id) } as Store);
      if (ONLINE) {
        supabase()
          .from(t)
          .delete()
          .eq("id", id)
          .then(({ error }) => report(t, error));
      }
      if (victim && !opts.silent) {
        toast("Deleted", () => insert(t, victim));
      }
    },
    [commit, report, toast, insert],
  );

  const loadSeed = useCallback(async () => {
    const seed = buildSeed();
    if (!ONLINE) {
      commit(seed);
      return;
    }
    const sb = supabase();
    // Parents before children so foreign keys resolve.
    for (const t of TABLES) {
      const rows = seed[t] as object[];
      if (!rows.length) continue;
      const { error } = await sb.from(t).insert(rows);
      if (error) {
        toast(`Import stopped at ${t}: ${error.message}`);
        break;
      }
    }
    await loadAll();
  }, [commit, loadAll, toast]);

  /**
   * Brings back rows from a backup file. It only adds what's missing (matched by id), so nothing you
   * have now is changed or deleted, and running it twice does nothing the second time.
   */
  const restoreBackup = useCallback(
    async (data: Partial<Store>) => {
      const cur = storeRef.current;
      const missing = TABLES.map((t) => {
        const have = new Set((cur[t] as { id: string }[]).map((r) => r.id));
        const rows = ((data[t] ?? []) as { id?: string }[]).filter((r) => r && typeof r === "object" && r.id && !have.has(r.id));
        return [t, rows] as const;
      });
      const total = missing.reduce((n, [, rows]) => n + rows.length, 0);
      if (!total) return 0;
      if (!ONLINE) {
        const next = { ...cur } as Record<string, unknown[]>;
        missing.forEach(([t, rows]) => (next[t] = [...(cur[t] as unknown[]), ...rows]));
        commit(migrateClasses(next as Store));
        return total;
      }
      const sb = supabase();
      const uid = session?.user.id;
      let added = 0;
      // Parents before children so foreign keys resolve.
      for (const [t, rows] of missing) {
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, user_id: uid }));
          const { error } = await sb.from(t).upsert(chunk, { onConflict: "id", ignoreDuplicates: true });
          if (error) {
            toast(`Restore stopped at ${t}: ${error.message}`);
            await loadAll();
            return added;
          }
          added += chunk.length;
        }
      }
      await loadAll();
      return added;
    },
    [commit, loadAll, session, toast],
  );

  const resetLocal = useCallback(() => {
    if (ONLINE) return;
    commit(buildSeed());
  }, [commit]);

  const signOut = useCallback(async () => {
    if (ONLINE) await supabase().auth.signOut();
    commit(empty());
  }, [commit]);

  const isEmpty = ready && store.students.length === 0 && store.transactions.length === 0 && store.tasks.length === 0;

  const value = useMemo<Ctx>(
    () => ({
      store,
      ready,
      online: ONLINE,
      session,
      needsLogin,
      isEmpty,
      insert,
      update,
      remove,
      loadSeed,
      resetLocal,
      restoreBackup,
      toast,
      toasts,
      dismissToast,
      signOut,
      storeRef,
    }),
    [store, ready, session, needsLogin, isEmpty, insert, update, remove, loadSeed, resetLocal, restoreBackup, toast, toasts, dismissToast, signOut],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
