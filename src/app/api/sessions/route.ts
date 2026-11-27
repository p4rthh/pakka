import { error, json, readJson } from "@/server/http";
import { createSession, sessionView } from "@/server/store";

/**
 * Start a call. Body: {buyerType?: "household"|"wholesaler", buyerName?, buyerPhone?,
 * mode?: "auto"|"rules"}. "rules" forces the deterministic extractor (demo mode);
 * "auto" uses the LLM when a key is set, else rules.
 */
export async function POST(req: Request) {
  const body = (await readJson(req)) ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : undefined);
  if (body.buyerType !== undefined && body.buyerType !== "household" && body.buyerType !== "wholesaler") {
    return error(400, "buyerType must be household or wholesaler");
  }
  const session = createSession({
    buyerType: body.buyerType as "household" | "wholesaler" | undefined,
    buyerName: str(body.buyerName),
    buyerPhone: str(body.buyerPhone),
    mode: body.mode === "rules" ? "rules" : "auto",
  });
  return json(sessionView(session), 201);
}
