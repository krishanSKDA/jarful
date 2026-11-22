import { z } from "zod";
import { body, clientIp, ok, rateLimit, route } from "@/lib/api";
import { ensureProvisioned, hashPassword, newId, startSession, USER_COLUMNS, type User } from "@/lib/auth";
import { one } from "@/lib/db";
import { UserFacingError } from "@/lib/goals";

const Schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
});

export const POST = route(async (req) => {
  rateLimit(`signup:${clientIp(req)}`, 10, 60_000);
  const input = await body(req, Schema);
  const exists = await one("SELECT 1 FROM users WHERE email = $1", [input.email]);
  if (exists) throw new UserFacingError("An account with this email already exists. Sign in instead.", 409);

  const user = await one<User>(
    `INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,$3,$4)
     RETURNING ${USER_COLUMNS}`,
    [newId(), input.email, input.name, await hashPassword(input.password)],
  );
  await startSession(user!.id);
  // Create the wallet now so the deposit address is ready; if it fails, the dashboard retries.
  await ensureProvisioned(user!).catch((e) => console.error("provision failed", e));
  return ok({ ok: true }, 201);
});
