import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { config } from "./env";
import { one } from "./db";
import { createTmUser } from "./tm";

const COOKIE = "jarful_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export type User = {
  id: string;
  email: string;
  name: string;
  tm_user_id: string | null;
  solana_address: string | null;
  evm_address: string | null;
};

const key = () => new TextEncoder().encode(config.sessionSecret());

export async function startSession(userId: string) {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user, or null. Deduplicated per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return await one<User>(
      "SELECT id, email, name, tm_user_id, solana_address, evm_address FROM users WHERE id = $1",
      [payload.sub],
    );
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export async function checkPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function newId() {
  return randomUUID();
}

/**
 * Make sure the user has a True Markets user + wallets. Safe to call repeatedly:
 * the same external_ref_id always returns the same Gateway user.
 */
export async function ensureProvisioned(user: User): Promise<User> {
  if (user.tm_user_id && user.solana_address) return user;
  const tmUser = await createTmUser(`${config.externalRefPrefix}_${user.id}`);
  const solana = tmUser.wallets.find((w) => w.chain_family === "solana")?.address ?? null;
  const evm = tmUser.wallets.find((w) => w.chain_family === "evm")?.address ?? null;
  const updated = await one<User>(
    `UPDATE users SET tm_user_id = $2, solana_address = $3, evm_address = $4 WHERE id = $1
     RETURNING id, email, name, tm_user_id, solana_address, evm_address`,
    [user.id, tmUser.user_id, solana, evm],
  );
  return updated ?? user;
}
