import { z } from "zod";
import { body, clientIp, ok, rateLimit, route } from "@/lib/api";
import { checkPassword, startSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { UserFacingError } from "@/lib/goals";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const POST = route(async (req) => {
  rateLimit(`login:${clientIp(req)}`, 10, 60_000);
  const input = await body(req, Schema);
  const user = await one<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = $1", [input.email]);
  if (!user || !(await checkPassword(input.password, user.password_hash))) {
    throw new UserFacingError("That email and password don't match.", 401);
  }
  await startSession(user.id);
  return ok({ ok: true });
});
