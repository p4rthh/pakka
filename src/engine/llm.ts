import type { Action, Catalogue, ConversationState, ItemRef, Qty, RejectReason, Unit } from "./types";
import type { Extractor } from "./session";

// LLM extraction behind a small provider interface. The model sees the
// catalogue, the current order and recent transcript, and returns the same
// action vocabulary the rule-based extractor produces, so the reducer, bill
// and insights code are shared. Output is validated; anything malformed throws
// and the session falls back to the rule-based extractor for that line.

export interface LlmClient {
  readonly name: string;
  complete(system: string, user: string): Promise<string>;
}

export type LlmProvider = "anthropic" | "gemini";

export interface LlmConfig {
  provider: LlmProvider | null;
  model: string | null;
  /** Human-readable status for the UI, e.g. "key not set". */
  message: string;
}

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: "claude-haiku-5-5",
  gemini: "gemini-3.5-flash-lite",
};

type Env = Record<string, string | undefined>;

/** A real value, not blank and not an untouched .env.example placeholder ("your-...-key"). */
export function envSet(v: string | undefined): boolean {
  const t = v?.trim();
  return !!t && !/^your-/i.test(t);
}

/** Pick a provider from env. PAKKA_LLM_PROVIDER forces one; otherwise the first key found wins. */
export function resolveLlmConfig(env: Env): LlmConfig {
  const forced = env.PAKKA_LLM_PROVIDER?.trim().toLowerCase();
  if (forced === "rules" || forced === "none") {
    return { provider: null, model: null, message: "LLM disabled (PAKKA_LLM_PROVIDER=rules): using rule-based extraction" };
  }
  const has = (k: string) => envSet(env[k]);
  const pick = (p: LlmProvider): LlmConfig => {
    const model = (p === "anthropic" ? env.ANTHROPIC_MODEL : env.GEMINI_MODEL)?.trim() || DEFAULT_MODELS[p];
    return { provider: p, model, message: `LLM extraction: ${p} (${model})` };
  };
  if (forced === "anthropic" || forced === "gemini") {
    const key = forced === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY";
    if (has(key)) return pick(forced);
    return { provider: null, model: null, message: `${key} key not set: using rule-based extraction` };
  }
  if (has("ANTHROPIC_API_KEY")) return pick("anthropic");
  if (has("GEMINI_API_KEY")) return pick("gemini");
  return { provider: null, model: null, message: "LLM key not set (ANTHROPIC_API_KEY or GEMINI_API_KEY): using rule-based extraction" };
}

export function anthropicClient(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    name: `anthropic:${model}`,
    async complete(system, user) {
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`anthropic HTTP ${res.status}`);
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    },
  };
}

export function geminiClient(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    name: `gemini:${model}`,
    async complete(system, user) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`gemini HTTP ${res.status}`);
      const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    },
  };
}

export function clientFromConfig(cfg: LlmConfig, env: Env, fetchImpl?: typeof fetch): LlmClient | null {
  if (!cfg.provider || !cfg.model) return null;
  if (cfg.provider === "anthropic") return anthropicClient(env.ANTHROPIC_API_KEY!.trim(), cfg.model, fetchImpl);
  return geminiClient(env.GEMINI_API_KEY!.trim(), cfg.model, fetchImpl);
}

export const SYSTEM_PROMPT = `You follow a phone call between a buyer and an Indian shopkeeper (Hindi, Hinglish, Marathi-English, sometimes Devanagari).
For the NEWEST line only, output the order-taking actions it implies, as JSON: {"actions": [...]}.
Action types (use catalogue ids in skuIds; several ids when the words fit several products):
- {"type":"browse","category":"<category id>","skuIds":[...],"label":"<words>"}  buyer asks what is available ("rice mein kya kya hai")
- {"type":"ask","ref":REF,"qty":QTY?}  buyer asks about / mentions a product without committing
- {"type":"confirm","ref":REF,"qty":QTY?}  buyer commits to a product ("de do", "chahiye", a list with quantities)
- {"type":"reject","ref":REF,"reason":"price"|"changed-mind"|"swapped"|"other"}  buyer drops a product ("nahi", "mehenga hai", "X ki jagah Y")
- {"type":"set_qty","ref":REF,"qty":QTY}  buyer corrects a quantity ("5 nahi, 10 kilo kar do")
- {"type":"accept_focus","qty":QTY?} / {"type":"reject_focus","reason":...}  buyer says "chalega"/"nahi" without naming the product (refers to what the seller just offered or what was last discussed)
- {"type":"suggest","skuIds":[...]}  seller mentions or offers products (seller lines never confirm anything)
- {"type":"unknown_product","label":"<words>","qty":QTY?,"asked":bool}  buyer wants something not in the catalogue
- {"type":"readback"}  seller reads the order back ("toh final ...")
- {"type":"agree"}  buyer accepts the read-back / says that is all ("haan sahi hai", "bas itna hi")
REF = {"label":"<words as spoken>","skuIds":["id",...],"categoryOnly":bool?,"category":"<category id>"?}
QTY = {"value":number,"unit":"kg"|"gram"|"litre"|"packet"|"piece"|"bori"|"dabba"} (omit unit if none was said)
Numbers followed by rupaye/rs are prices, not quantities. Output only JSON, no prose.`;

function catalogueBrief(catalogue: Catalogue): string {
  return catalogue.skus
    .map((s) => `${s.id} | ${s.name} | ${s.category} | ${s.aliases.join(", ")} | ${s.stock > 0 ? "in stock" : "OUT OF STOCK"}`)
    .join("\n");
}

function orderBrief(state: ConversationState): string {
  if (!state.candidates.length) return "(empty)";
  return state.candidates
    .map((c) => `${c.label} [${c.skuId ?? c.options?.join("/") ?? "unknown"}] ${c.state}${c.qty ? ` ${c.qty.value} ${c.qty.unit ?? ""}` : ""}`)
    .join("\n");
}

export function buildUserPrompt(state: ConversationState, catalogue: Catalogue, speaker: string, text: string): string {
  const recent = state.transcript.slice(-8).map((l) => `${l.speaker}: ${l.text}`).join("\n");
  return [
    `CATALOGUE (id | name | category | aliases | stock):\n${catalogueBrief(catalogue)}`,
    `CATEGORIES: ${catalogue.categories.map((c) => c.id).join(", ")}`,
    `ORDER SO FAR (phase: ${state.phase}):\n${orderBrief(state)}`,
    `RECENT LINES:\n${recent || "(call just started)"}`,
    `NEWEST LINE -> ${speaker}: ${text}`,
  ].join("\n\n");
}

const UNITS = new Set<Unit>(["kg", "gram", "litre", "packet", "piece", "bori", "dabba"]);
const REASONS = new Set<RejectReason>(["price", "changed-mind", "swapped", "declined-substitute", "other"]);

/** Omitted qty -> undefined; a supplied but invalid qty throws so the line falls back to rules. */
function vQty(q: unknown): Qty | undefined {
  if (q === undefined || q === null) return undefined;
  if (typeof q !== "object") throw new Error(`invalid qty ${JSON.stringify(q)}`);
  const o = q as { value?: unknown; unit?: unknown };
  const value = typeof o.value === "string" && o.value.trim() ? Number(o.value) : o.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`invalid qty ${JSON.stringify(q)}`);
  if (o.unit === undefined || o.unit === null || o.unit === "") return { value };
  if (typeof o.unit !== "string" || !UNITS.has(o.unit as Unit)) throw new Error(`unsupported unit ${JSON.stringify(o.unit)}`);
  return { value, unit: o.unit as Unit };
}

function vRef(r: unknown, catalogue: Catalogue): ItemRef | null {
  if (!r || typeof r !== "object") return null;
  const o = r as { label?: unknown; skuIds?: unknown; categoryOnly?: unknown; category?: unknown };
  const known = new Set(catalogue.skus.map((s) => s.id));
  const ids = Array.isArray(o.skuIds) ? o.skuIds.filter((x): x is string => typeof x === "string" && known.has(x)) : [];
  if (!ids.length) return null;
  const cats = new Set(ids.map((id) => catalogue.skus.find((s) => s.id === id)!.category));
  return {
    label: typeof o.label === "string" && o.label ? o.label : ids[0],
    skuIds: catalogue.skus.filter((s) => ids.includes(s.id)).map((s) => s.id),
    categoryOnly: o.categoryOnly === true || undefined,
    category: cats.size === 1 ? [...cats][0] : undefined,
  };
}

export interface ParsedLlmActions {
  actions: Action[];
  /** Model actions that failed validation (unknown type, unknown SKU, bad quantity). */
  dropped: number;
}

/** Validate untrusted model output into engine actions. Throws if there is no usable JSON. */
export function parseLlmActions(raw: string, catalogue: Catalogue): ParsedLlmActions {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in model output");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { actions?: unknown };
  if (!Array.isArray(parsed.actions)) throw new Error("model output has no actions array");
  const out: Action[] = [];
  for (const a of parsed.actions as Array<Record<string, unknown>>) {
    if (!a || typeof a !== "object") continue;
    const reason = (REASONS.has(a.reason as RejectReason) ? a.reason : "other") as RejectReason;
    switch (a.type) {
      case "browse": {
        const ids = Array.isArray(a.skuIds) ? a.skuIds.filter((x): x is string => typeof x === "string" && catalogue.skus.some((s) => s.id === x)) : [];
        const category = typeof a.category === "string" ? a.category : "";
        const skuIds = ids.length ? ids : catalogue.skus.filter((s) => s.category === category).map((s) => s.id);
        if (skuIds.length) out.push({ type: "browse", category, skuIds, label: typeof a.label === "string" ? a.label : category });
        break;
      }
      case "ask":
      case "confirm": {
        const ref = vRef(a.ref, catalogue);
        if (ref) out.push({ type: a.type, ref, qty: vQty(a.qty) });
        break;
      }
      case "reject": {
        const ref = vRef(a.ref, catalogue);
        if (ref) out.push({ type: "reject", ref, reason });
        break;
      }
      case "set_qty": {
        const ref = vRef(a.ref, catalogue);
        const qty = vQty(a.qty);
        if (ref && qty) out.push({ type: "set_qty", ref, qty });
        break;
      }
      case "accept_focus":
        out.push({ type: "accept_focus", qty: vQty(a.qty) });
        break;
      case "reject_focus":
        out.push({ type: "reject_focus", reason });
        break;
      case "set_focus_qty": {
        const qty = vQty(a.qty);
        if (qty) out.push({ type: "set_focus_qty", qty });
        break;
      }
      case "suggest": {
        const ids = Array.isArray(a.skuIds) ? a.skuIds.filter((x): x is string => typeof x === "string" && catalogue.skus.some((s) => s.id === x)) : [];
        if (ids.length) out.push({ type: "suggest", skuIds: ids });
        break;
      }
      case "unknown_product":
        if (typeof a.label === "string" && a.label.trim()) out.push({ type: "unknown_product", label: a.label.trim(), qty: vQty(a.qty), asked: a.asked === true });
        break;
      case "readback":
        out.push({ type: "readback" });
        break;
      case "agree":
        out.push({ type: "agree" });
        break;
    }
  }
  return { actions: out, dropped: (parsed.actions as unknown[]).length - out.length };
}

export function llmExtractor(client: LlmClient): Extractor {
  return {
    name: client.name,
    async extract({ utterance, state, catalogue }) {
      const raw = await client.complete(SYSTEM_PROMPT, buildUserPrompt(state, catalogue, utterance.speaker, utterance.text));
      const { actions, dropped } = parseLlmActions(raw, catalogue);
      // Never half-apply a line: one bad action (e.g. a reject with an unknown SKU) could leave the
      // order inconsistent, so the whole line falls back to the rule-based extractor instead.
      if (dropped > 0) throw new Error(`${dropped} model action(s) failed validation`);
      // Seller lines may only offer or read back; never let a model confirm on the buyer's behalf.
      if (utterance.speaker === "seller") return actions.filter((a) => a.type === "suggest" || a.type === "readback");
      return actions;
    },
  };
}
