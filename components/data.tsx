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
      (next as Record<string, unknown[]>)[TABLES[i]] = (r.data as unknown[]) ?? [];
    });
    commit(next);
    setReady(true);
  }, [commit]);

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
          const row = payload.new as { id: string };
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
  }, [session, loadAll, commit]);

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
      if (ONLINE) {
        supabase()
          .from(t)
          .update(patch as object)
          .eq("id", id)
          .then(({ error }) => report(t, error));
      }
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
      toast,
      toasts,
      dismissToast,
      signOut,
      storeRef,
    }),
    [store, ready, session, needsLogin, isEmpty, insert, update, remove, loadSeed, resetLocal, toast, toasts, dismissToast, signOut],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
