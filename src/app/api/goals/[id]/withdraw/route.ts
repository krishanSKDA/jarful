import { authed, fail, ok } from "@/lib/api";
import { getGoal, withdraw } from "@/lib/goals";

type Ctx = { params: Promise<{ id: string }> };

export const POST = authed<Ctx>(async (_req, { params }, user) => {
  const goal = await getGoal(user.id, (await params).id);
  if (!goal) return fail("Goal not found.", 404);
  const contribution = await withdraw(user, goal);
  return ok({ contribution }, 201);
});
