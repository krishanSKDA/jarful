import { z } from "zod";
import { authed, body, fail, ok } from "@/lib/api";
import { contribute, getGoal } from "@/lib/goals";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({ usd: z.number().positive("Enter an amount.") });

export const POST = authed<Ctx>(async (req, { params }, user) => {
  const goal = await getGoal(user.id, (await params).id);
  if (!goal) return fail("Goal not found.", 404);
  const { usd } = await body(req, Schema);
  const contribution = await contribute(user, goal, usd);
  return ok({ contribution }, 201);
});
