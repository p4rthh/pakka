import { error, json } from "@/server/http";
import { getSession, sessionView } from "@/server/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = getSession((await ctx.params).id);
  return session ? json(sessionView(session)) : error(404, "no such session");
}
