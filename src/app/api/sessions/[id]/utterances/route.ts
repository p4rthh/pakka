import { error, json, MAX_TEXT, readJson } from "@/server/http";
import { addUtterance, getSession, sessionView } from "@/server/store";

/** Add one line of the call. Body: {speaker: "buyer"|"seller", text, confidence?: 0..1}. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = getSession((await ctx.params).id);
  if (!session) return error(404, "no such session");
  if (session.result) return error(409, "order already confirmed");
  const body = await readJson(req);
  if (!body) return error(400, "JSON body required");
  if (body.speaker !== "buyer" && body.speaker !== "seller") return error(400, "speaker must be buyer or seller");
  if (typeof body.text !== "string" || !body.text.trim()) return error(400, "text required");
  if (body.text.length > MAX_TEXT) return error(413, `text longer than ${MAX_TEXT} characters`);
  let confidence: number | undefined;
  if (body.confidence !== undefined && body.confidence !== null) {
    if (typeof body.confidence !== "number" || body.confidence < 0 || body.confidence > 1) return error(400, "confidence must be 0..1");
    confidence = body.confidence;
  }
  const line = await addUtterance(session, { speaker: body.speaker, text: body.text, confidence });
  return json({ line, session: sessionView(session) });
}
