"use client";

// Barebones moderation console. Auth-gated via Supabase Auth; database
// RLS policies (supabase/migrations/0004_admin.sql) only grant access to
// the admin email, so this page is safe to ship publicly.
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../../lib/db";

const ADMIN_EMAIL = "cabbagetree876@gmail.com";

interface ReportedRow {
  id: string;
  username: string;
  flagged_name: string | null;
  day: string;
  time_elapsed: number | null;
  hidden: boolean;
  reportCount: number;
}

function formatTime(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function AdminPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ReportedRow[] | null>(null);

  const loadReports = useCallback(async () => {
    const sb = getSupabase();
    const { data: reports, error: repErr } = await sb
      .from("reports")
      .select("solution_id");
    if (repErr) {
      setError(repErr.message);
      return;
    }
    const counts = new Map<string, number>();
    for (const r of reports as { solution_id: string }[]) {
      counts.set(r.solution_id, (counts.get(r.solution_id) ?? 0) + 1);
    }
    if (counts.size === 0) {
      setRows([]);
      return;
    }
    const { data: sols, error: solErr } = await sb
      .from("solutions")
      .select("id, username, flagged_name, day, time_elapsed, hidden")
      .in("id", [...counts.keys()]);
    if (solErr) {
      setError(solErr.message);
      return;
    }
    const result = (sols as Omit<ReportedRow, "reportCount">[])
      .map((s) => ({ ...s, reportCount: counts.get(s.id) ?? 0 }))
      .sort((a, b) => b.reportCount - a.reportCount);
    setRows(result);
  }, []);

  // Restore an existing session on load
  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          setSignedIn(true);
          loadReports();
        }
      });
  }, [loadReports]);

  const signIn = async () => {
    setBusy(true);
    setError("");
    const { error: err } = await getSupabase().auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSignedIn(true);
    setPassword("");
    loadReports();
  };

  const signOut = async () => {
    await getSupabase().auth.signOut();
    setSignedIn(false);
    setRows(null);
  };

  const update = async (
    id: string,
    patch: Partial<Pick<ReportedRow, "username" | "flagged_name" | "hidden">>
  ) => {
    setError("");
    const { error: err } = await getSupabase()
      .from("solutions")
      .update(patch)
      .eq("id", id);
    if (err) setError(err.message);
    loadReports();
  };

  if (!signedIn) {
    return (
      <div className="h-dvh flex items-center justify-center bg-[#f2ede7]">
        <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
          <h1 className="text-lg font-medium text-stone-800 mb-1">
            Caladay Admin
          </h1>
          <p className="text-sm text-stone-500 mb-4">{ADMIN_EMAIL}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && signIn()}
            placeholder="Password"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-stone-400"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <button
            onClick={signIn}
            disabled={busy || !password}
            className="w-full px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-900 text-white transition-colors disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f2ede7] px-6 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-light text-stone-700">
            Reported entries
          </h1>
          <div className="flex gap-2">
            <button onClick={loadReports} className="icon-button">
              Refresh
            </button>
            <button onClick={signOut} className="icon-button">
              Sign out
            </button>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {rows === null ? (
          <p className="text-stone-400">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-stone-400">
            No reports. Nothing needs your attention.
          </p>
        ) : (
          <div className="bg-white rounded-lg divide-y divide-stone-100">
            {rows.map((row) => (
              <div
                key={row.id}
                className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
              >
                <div>
                  <span className="font-mono text-lg tracking-wider text-stone-800">
                    {row.username}
                  </span>
                  {row.flagged_name && (
                    <span className="ml-2 text-sm text-stone-400">
                      (was {row.flagged_name})
                    </span>
                  )}
                  {row.hidden && (
                    <span className="ml-2 text-xs text-red-500">hidden</span>
                  )}
                  <div className="text-sm text-stone-500">
                    {row.day} · {formatTime(row.time_elapsed)} ·{" "}
                    <strong>{row.reportCount}</strong> report
                    {row.reportCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  {row.flagged_name ? (
                    <button
                      onClick={() =>
                        update(row.id, {
                          username: row.flagged_name!,
                          flagged_name: null,
                        })
                      }
                      className="px-3 py-1 rounded-full bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
                    >
                      Restore name
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        update(row.id, {
                          flagged_name: row.username,
                          username: "???",
                        })
                      }
                      className="px-3 py-1 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
                    >
                      Mask name
                    </button>
                  )}
                  <button
                    onClick={() => update(row.id, { hidden: !row.hidden })}
                    className="px-3 py-1 rounded-full bg-stone-200 hover:bg-stone-300 text-stone-600 transition-colors"
                  >
                    {row.hidden ? "Unhide" : "Hide"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
