import { error, json, readJson } from "@/server/http";
import { confirmSession, getSession, sessionView } from "@/server/store";

/**
 * Shopkeeper tapped Confirm. Nothing is billed before this. Returns the bill,
 * packing slip and WhatsApp click-to-chat link, or 409 with the open issues
 * (ambiguous product, missing quantity). Body {force: true} bills what is clear.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = getSession((await ctx.params).id);
  if (!session) return error(404, "no such session");
  const body = (await readJson(req)) ?? {};
  const { issues, result } = await confirmSession(session, body.force === true);
  if (!result) return error(409, "order has open issues", { issues });
  return json({ ...result, session: sessionView(session) });
}
