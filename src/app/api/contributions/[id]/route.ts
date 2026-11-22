import { authed, fail, ok } from "@/lib/api";
import { syncContribution } from "@/lib/goals";

type Ctx = { params: Promise<{ id: string }> };

/** Poll target while an order settles: refreshes status from the Gateway order. */
export const GET = authed<Ctx>(async (_req, { params }, user) => {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Not found.", 404);
  const contribution = await syncContribution(user, id);
  return contribution ? ok({ contribution }) : fail("Not found.", 404);
});
