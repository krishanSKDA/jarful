import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser, type User } from "./auth";
import { friendly, UserFacingError } from "./goals";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Reject cross-site writes: JSON body required and Origin (when sent) must match the host. */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function body<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  if (!req.headers.get("content-type")?.includes("application/json")) throw new UserFacingError("Expected a JSON body.", 415);
  const raw = await req.json().catch(() => {
    throw new UserFacingError("The request body isn't valid JSON.");
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  return parsed.data;
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wrap a route: same-origin check for writes, consistent error envelope. */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    if (req.method !== "GET" && !sameOrigin(req)) return fail("Cross-site request blocked.", 403);
    try {
      return await fn(req, ctx);
    } catch (err) {
      const f = friendly(err);
      return fail(f.message, f.status);
    }
  };
}

/** Like route(), but requires a signed-in user. */
export function authed<C>(fn: (req: NextRequest, ctx: C, user: User) => Promise<Response>): Handler<C> {
  return route(async (req, ctx) => {
    const user = await currentUser();
    if (!user) return fail("Sign in to continue.", 401);
    return fn(req, ctx, user);
  });
}

// Minimal fixed-window limiter for auth endpoints (per server instance).
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  if (++h.n > max) throw new UserFacingError("Too many attempts. Wait a minute and try again.", 429);
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
