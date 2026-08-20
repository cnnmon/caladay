// Validated leaderboard submission. The only write path into the solutions
// table: validates the username and that the grid is a genuine solution for
// the given day, then inserts using the service role.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  isUsernameBanned,
  validateSolution,
  validateUsername,
} from "../_shared/puzzle.ts";

// Solutions may only be submitted for days close to the server's current
// date (covers all client time zones plus a just-after-midnight submit).
const MAX_DAY_SKEW_MS = 2 * 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let body: {
    username?: unknown;
    grid?: unknown;
    day?: unknown;
    startedAt?: unknown;
    timeElapsed?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON");
  }

  if (
    typeof body.username !== "string" ||
    typeof body.grid !== "string" ||
    typeof body.day !== "string"
  ) {
    return errorResponse("Missing required fields");
  }

  const username = body.username.toUpperCase().slice(0, 3);
  const usernameError = validateUsername(username);
  if (usernameError) return errorResponse(usernameError);
  if (isUsernameBanned(username)) {
    return errorResponse("That name is not allowed");
  }

  const gridError = validateSolution(body.grid, body.day);
  if (gridError) return errorResponse(`Invalid solution: ${gridError}`);

  // Only accept submissions for (roughly) the current day
  const dayTime = new Date(body.day + "T12:00:00Z").getTime();
  if (Math.abs(Date.now() - dayTime) > MAX_DAY_SKEW_MS) {
    return errorResponse("Submissions are only accepted for today's puzzle");
  }

  // Sanity-check the self-reported solve time
  const timeElapsed =
    typeof body.timeElapsed === "number" ? body.timeElapsed : null;
  if (timeElapsed !== null && (timeElapsed < 0 || timeElapsed > 86400000)) {
    return errorResponse("Invalid solve time");
  }
  const startedAt = typeof body.startedAt === "string" ? body.startedAt : null;
  // Closed set; anything unexpected records as "web"
  const platform =
    (body as { platform?: unknown }).platform === "ios" ? "ios" : "web";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase
    .from("solutions")
    .insert({
      username,
      grid: body.grid,
      day: body.day,
      started_at: startedAt,
      time_elapsed: timeElapsed,
      platform,
    })
    .select("id")
    .single();

  if (error) {
    console.error("insert failed:", error);
    return errorResponse("Failed to save solution", 500);
  }

  return new Response(JSON.stringify({ id: data.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
