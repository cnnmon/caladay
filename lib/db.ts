// Supabase data layer. Row shapes mirror the old Convex documents
// (_id, timeElapsed, startedAt) so components need minimal changes.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  beginSubmission,
  completeSubmission,
  failSubmission,
} from "./submissions";

export interface SolutionRow {
  _id: string;
  username: string;
  grid: string;
  day: string;
  startedAt?: string;
  timeElapsed?: number;
  platform?: string; // "web" | "ios"; absent on pre-1.0.1 rows
}

interface DbRow {
  id: string;
  username: string;
  grid: string;
  day: string;
  started_at: string | null;
  time_elapsed: number | null;
  platform: string | null;
}

let client: SupabaseClient | null = null;

// Shared client (also used by the /admin page for auth + moderation)
export function getSupabase(): SupabaseClient {
  return getClient();
}

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}

function toSolution(row: DbRow): SolutionRow {
  return {
    _id: row.id,
    username: row.username,
    grid: row.grid,
    day: row.day,
    startedAt: row.started_at ?? undefined,
    timeElapsed: row.time_elapsed ?? undefined,
    platform: row.platform ?? undefined,
  };
}

const COLUMNS = "id, username, grid, day, started_at, time_elapsed, platform";

// All non-hidden solutions, newest first (hidden filtered by RLS).
export async function listSolutions(): Promise<SolutionRow[]> {
  const { data, error } = await getClient()
    .from("solutions")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DbRow[]).map(toSolution);
}

export async function getSolutionById(
  id: string
): Promise<SolutionRow | null> {
  const { data, error } = await getClient()
    .from("solutions")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toSolution(data as DbRow) : null;
}

// Submit through the validating edge function (the only write path).
// Throws Error with a user-facing message on rejection.
export async function submitSolution(args: {
  username: string;
  grid: string;
  day: string;
  startedAt?: string;
  timeElapsed?: number;
  platform?: string;
}): Promise<string> {
  const submission = {
    ...args,
    username: args.username.toUpperCase().slice(0, 3),
    platform: args.platform === "ios" ? "ios" : "web",
  };
  const pendingId = beginSubmission(submission);
  try {
    const { data, error } = await getClient().functions.invoke(
      "submit-solution",
      { body: args }
    );
    if (error) {
      // FunctionsHttpError carries the response; surface our {error} message
      let message = "Failed to submit. Please try again.";
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const body = await context.json();
          if (typeof body?.error === "string") message = body.error;
        } catch {
          // response wasn't JSON; keep the generic message
        }
      }
      throw new Error(message);
    }
    const id = (data as { id: string }).id;
    completeSubmission(pendingId, id);
    return id;
  } catch (error) {
    failSubmission(
      pendingId,
      error instanceof Error ? error.message : "Failed to submit. Please try again.",
    );
    throw error;
  }
}

export async function reportSolution(solutionId: string): Promise<void> {
  const { error } = await getClient()
    .from("reports")
    .insert({ solution_id: solutionId });
  if (error) throw new Error(error.message);
}
