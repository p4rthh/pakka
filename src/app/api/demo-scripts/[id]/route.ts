import { getScript } from "@/data/scripts";
import { error, json } from "@/server/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const script = getScript((await ctx.params).id);
  return script ? json(script) : error(404, "no such demo script");
}
