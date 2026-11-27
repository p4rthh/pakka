import { catalogue } from "@/data/catalogue";
import { buildBill, confirmIssues, createConversation, processTranscript, rulesExtractor, type Utterance } from "@/engine";
import { error, json, MAX_TEXT, readJson } from "@/server/http";

/**
 * Stateless: interpret a whole transcript at once with the deterministic
 * extractor. Body: {buyerType?, utterances: [{speaker, text, confidence?}]}.
 * Useful for batch processing a recorded call or testing a new frontend.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body || !Array.isArray(body.utterances)) return error(400, "utterances array required");
  if (body.utterances.length > 200) return error(413, "at most 200 utterances");
  const utterances: Utterance[] = [];
  for (const u of body.utterances as Array<Record<string, unknown>>) {
    if (!u || (u.speaker !== "buyer" && u.speaker !== "seller") || typeof u.text !== "string" || u.text.length > MAX_TEXT) {
      return error(400, "each utterance needs speaker buyer|seller and text");
    }
    utterances.push({ speaker: u.speaker, text: u.text, confidence: typeof u.confidence === "number" ? u.confidence : undefined });
  }
  const buyerType = body.buyerType === "wholesaler" ? "wholesaler" : "household";
  const state = await processTranscript(createConversation(buyerType), utterances, { catalogue, extractor: rulesExtractor });
  const issues = confirmIssues(state, catalogue);
  const draft = buildBill(state, catalogue, { id: "DRAFT", buyerName: "", buyerPhone: "", createdAt: new Date().toISOString() });
  return json({ state, issues, draftBill: draft });
}
