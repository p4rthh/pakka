import { catalogue } from "../data/catalogue";
import {
  buildBill,
  buildPackingSlip,
  clientFromConfig,
  confirmIssues,
  createConversation,
  insightsFromCall,
  llmExtractor,
  processUtterance,
  resolveLlmConfig,
  rulesExtractor,
  summarize,
  whatsappLink,
  whatsappText,
  type Bill,
  type BuyerType,
  type ConfirmIssue,
  type ConversationState,
  type Extractor,
  type InsightEvent,
  type PackingSlip,
  type TranscriptLine,
  type Utterance,
} from "../engine";

// In-memory session and insight store for the prototype. One Node process
// (dev server or the Docker container) holds all calls; restart clears them.
// Swap this module for a database without touching the engine or the UI.

export type ExtractorMode = "auto" | "rules";

export interface Session {
  id: string;
  createdAt: string;
  buyerName: string;
  buyerPhone: string;
  mode: ExtractorMode;
  state: ConversationState;
  result?: ConfirmResult;
  /** Serialises utterance processing so fast speech input cannot race. */
  queue: Promise<unknown>;
}

export interface ConfirmResult {
  bill: Bill;
  packingSlip: PackingSlip;
  whatsapp: { text: string; url: string };
}

interface Store {
  sessions: Map<string, Session>;
  insights: InsightEvent[];
  billSeq: number;
}

const g = globalThis as unknown as { __pakkaStore?: Store };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A few earlier calls today, so the insights view is not empty on first load. */
function seedInsights(): InsightEvent[] {
  const at = `${today()}T04:30:00.000Z`;
  const e = (x: Omit<InsightEvent, "at" | "seeded">): InsightEvent => ({ ...x, at, seeded: true });
  return [
    e({ kind: "lost_sale", buyerType: "household", skuId: "rice-india-gate", label: "India Gate Classic Basmati", brand: "India Gate", reason: "out of stock", qty: { value: 10, unit: "kg" }, value: 1500 }),
    e({ kind: "lost_sale", buyerType: "wholesaler", skuId: "dal-masoor", label: "Masoor Dal", brand: "Loose", reason: "out of stock", qty: { value: 25, unit: "kg" }, value: 2500 }),
    e({ kind: "lost_sale", buyerType: "household", skuId: "soap-dettol", label: "Dettol Soap", brand: "Dettol", reason: "out of stock", qty: { value: 4, unit: "piece" }, value: 208 }),
    e({ kind: "swap", buyerType: "household", skuId: "oil-freedom-sunflower", label: "Freedom Sunflower Oil", brand: "Freedom", chosenSkuId: "oil-fortune-sunflower", reason: "out of stock" }),
    e({ kind: "not_stocked", buyerType: "household", label: "maggi", qty: { value: 4, unit: "packet" } }),
    e({ kind: "not_stocked", buyerType: "household", label: "maggi" }),
    e({ kind: "brand_ask", buyerType: "household", skuId: "rice-india-gate", label: "India Gate Classic Basmati", brand: "India Gate", reason: "asked" }),
    e({ kind: "brand_ask", buyerType: "household", skuId: "soap-dettol", label: "Dettol Soap", brand: "Dettol", reason: "asked" }),
  ];
}

function store(): Store {
  if (!g.__pakkaStore) g.__pakkaStore = { sessions: new Map(), insights: seedInsights(), billSeq: 0 };
  return g.__pakkaStore;
}

export function llmStatus() {
  return resolveLlmConfig(process.env);
}

function extractorFor(mode: ExtractorMode): Extractor {
  if (mode === "rules") return rulesExtractor;
  const cfg = resolveLlmConfig(process.env);
  const client = clientFromConfig(cfg, process.env);
  return client ? llmExtractor(client) : rulesExtractor;
}

export function createSession(input: { buyerType?: BuyerType; buyerName?: string; buyerPhone?: string; mode?: ExtractorMode }): Session {
  const id = crypto.randomUUID();
  const buyerType: BuyerType = input.buyerType === "wholesaler" ? "wholesaler" : "household";
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    buyerName: input.buyerName?.trim() || (buyerType === "wholesaler" ? "Kirana buyer" : "Household buyer"),
    buyerPhone: input.buyerPhone?.trim() || "",
    mode: input.mode === "rules" ? "rules" : "auto",
    state: createConversation(buyerType),
    queue: Promise.resolve(),
  };
  store().sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return store().sessions.get(id);
}

export async function addUtterance(session: Session, utt: Utterance): Promise<TranscriptLine> {
  const run = session.queue.then(async () => {
    const r = await processUtterance(session.state, utt, {
      catalogue,
      extractor: extractorFor(session.mode),
      fallback: rulesExtractor,
    });
    session.state = r.state;
    return r.line;
  });
  session.queue = run.catch(() => undefined);
  return run;
}

/** Shopkeeper pressed "Read back": same as the seller saying "toh final". */
export async function startReadback(session: Session): Promise<void> {
  await addUtterance(session, { speaker: "seller", text: "Toh final" });
}

export async function confirmSession(session: Session, force = false): Promise<{ issues: ConfirmIssue[]; result?: ConfirmResult }> {
  // Bill only after every line already said has been processed.
  await session.queue;
  if (session.result) return { issues: [], result: session.result };
  const issues = confirmIssues(session.state, catalogue);
  const blocking = force ? issues.filter((i) => i.problem === "nothing confirmed yet") : issues;
  if (blocking.length) return { issues: blocking };
  const s = store();
  s.billSeq += 1;
  const createdAt = new Date().toISOString();
  const id = `PK-${createdAt.slice(0, 10).replace(/-/g, "")}-${String(s.billSeq).padStart(3, "0")}`;
  const bill = buildBill(session.state, catalogue, { id, buyerName: session.buyerName, buyerPhone: session.buyerPhone, createdAt });
  const result: ConfirmResult = {
    bill,
    packingSlip: buildPackingSlip(bill, catalogue),
    whatsapp: { text: whatsappText(bill), url: whatsappLink(bill) },
  };
  session.result = result;
  s.insights.push(...insightsFromCall(session.state, catalogue, createdAt));
  return { issues, result };
}

export function dailyInsights(date = today()) {
  return summarize(store().insights, catalogue, date);
}

/** JSON-safe view of a session for the API. */
export function sessionView(session: Session) {
  return {
    id: session.id,
    createdAt: session.createdAt,
    buyerName: session.buyerName,
    buyerPhone: session.buyerPhone,
    mode: session.mode,
    shopName: catalogue.shopName[session.state.buyerType],
    state: session.state,
    issues: confirmIssues(session.state, catalogue),
    result: session.result ?? null,
  };
}
