import { error, json } from "@/server/http";
import { getSession, sessionView, startReadback } from "@/server/store";

/** Shopkeeper pressed "Read back": generates the read-back text from confirmed items. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = getSession((await ctx.params).id);
  if (!session) return error(404, "no such session");
  if (session.result) return error(409, "order already confirmed");
  await startReadback(session);
  return json(sessionView(session));
}
