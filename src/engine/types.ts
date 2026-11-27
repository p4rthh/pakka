// Core domain types for the Pakka conversation engine.
// Pure data: no framework, DOM or network dependencies, so the engine can be
// reused by any frontend, an API route, a telephony webhook or a test.

/** Base unit a SKU is priced and stocked in. */
export type BaseUnit = "kg" | "litre" | "packet" | "piece";

/** Every unit a speaker may use. Converted to a SKU's base unit via `unitFactors`. */
export type Unit = BaseUnit | "gram" | "bori" | "dabba";

export type BuyerType = "household" | "wholesaler";

export type Speaker = "buyer" | "seller";

export interface Sku {
  id: string;
  brand: string;
  name: string;
  category: string;
  /** Short name as a shopkeeper says it out loud, used in read-back ("Tata namak"). */
  spoken: string;
  /** Pack description shown on screen, e.g. "1 kg pouch". */
  pack: string;
  baseUnit: BaseUnit;
  /** How many base units one of each other unit holds. Base unit itself is always 1. */
  unitFactors: Partial<Record<Unit, number>>;
  price: { retail: number; wholesale: number };
  /** Stock on hand in base units. 0 means out of stock. */
  stock: number;
  /** Words that identify this SKU specifically (brand names, variety names). */
  aliases: string[];
  /** Variety tags used to find the nearest alternative (e.g. "basmati"). */
  tags: string[];
  /** Rack/shelf label printed on the packing slip. */
  rack: string;
}

export interface Category {
  id: string;
  label: string;
  /** Spoken words for the category in Hindi, Marathi and English. */
  words: string[];
}

export interface Catalogue {
  shopName: Record<BuyerType, string>;
  categories: Category[];
  skus: Sku[];
}

export interface Utterance {
  speaker: Speaker;
  text: string;
  /** Speech-recognition confidence, 0..1. Omitted means fully trusted (typed or scripted). */
  confidence?: number;
}

export interface Qty {
  value: number;
  /** Omitted when the speaker gave a bare number; the engine assumes the base unit. */
  unit?: Unit;
}

/** Reference to a product as spoken. `skuIds` holds every SKU it could mean. */
export interface ItemRef {
  /** Words as spoken, e.g. "tata namak". */
  label: string;
  skuIds: string[];
  /** True when the words named only a category ("chawal", "tel"). */
  categoryOnly?: boolean;
  category?: string;
}

export type RejectReason = "price" | "changed-mind" | "swapped" | "declined-substitute" | "other";

/**
 * Engine actions. Extractors (rule-based or LLM) turn one utterance into a
 * list of actions; the reducer applies them. Keeping this vocabulary small and
 * explicit is what lets the two extractors be swapped freely.
 */
export type Action =
  | { type: "browse"; category: string; skuIds: string[]; label: string }
  | { type: "ask"; ref: ItemRef; qty?: Qty }
  | { type: "confirm"; ref: ItemRef; qty?: Qty }
  | { type: "reject"; ref: ItemRef; reason: RejectReason }
  /** Change the quantity of an item already on the order (correction). */
  | { type: "set_qty"; ref: ItemRef; qty: Qty }
  /** Accept or reject whatever was being discussed, without naming it ("chalega", "nahi"). */
  | { type: "accept_focus"; qty?: Qty }
  | { type: "reject_focus"; reason: RejectReason }
  | { type: "set_focus_qty"; qty: Qty }
  /** Seller mentioned items (offering / listing). Updates the suggestion focus only. */
  | { type: "suggest"; skuIds: string[] }
  | { type: "unknown_product"; label: string; qty?: Qty; asked: boolean }
  | { type: "readback" }
  | { type: "agree" };

export type CandidateState = "asked" | "rejected" | "confirmed";

export type NeedsFlag = "qty" | "sku";

export interface CandidateEvent {
  utterance: number;
  note: string;
}

export interface Candidate {
  id: string;
  /** Resolved SKU, or null while ambiguous / unknown. */
  skuId: string | null;
  label: string;
  category?: string;
  state: CandidateState;
  qty?: Qty;
  /** Bare number given with no unit: the engine assumed the base unit. */
  unitAssumed?: boolean;
  reason?: RejectReason;
  /** Ordering key of the latest rejection (line index * 1000 + order within the line). */
  rejectedAt?: number;
  /** Possible SKUs while the reference is ambiguous. */
  options?: string[];
  /** The SKU is out of stock: the buyer wanted it but it cannot be billed. */
  unavailable?: boolean;
  /** Not in the catalogue at all. */
  unknown?: boolean;
  /** Touched by a low-confidence speech line: shopkeeper should double-check. */
  needsReview?: boolean;
  needs: NeedsFlag[];
  history: CandidateEvent[];
}

export interface StockCardItem {
  skuId: string;
  name: string;
  brand: string;
  pack: string;
  pricePerUnit: number;
  baseUnit: BaseUnit;
  stock: number;
  inStock: boolean;
  /** For out-of-stock items: the nearest in-stock alternative. */
  alternativeId?: string;
}

export interface StockCard {
  title: string;
  category: string;
  items: StockCardItem[];
  /** Utterance index that raised it. */
  utterance: number;
}

export type Phase = "ordering" | "readback" | "agreed";

export interface TranscriptLine extends Utterance {
  index: number;
  /** Actions the extractor produced for this line (for display / debugging). */
  actions: Action[];
  /** Which extractor produced them. */
  extractor: string;
  lowConfidence?: boolean;
  ignored?: boolean;
}

export interface ConversationState {
  buyerType: BuyerType;
  transcript: TranscriptLine[];
  candidates: Candidate[];
  stockCard: StockCard | null;
  phase: Phase;
  /** Read-back text, regenerated after any change once read-back has started. */
  readback: string | null;
  /** Candidate the buyer most recently talked about. */
  focusId: string | null;
  /** SKU the seller most recently offered, with the utterance index. */
  suggestion: { skuId: string; utterance: number } | null;
  warnings: string[];
  nextCandidateId: number;
}

export interface BillLine {
  skuId: string;
  name: string;
  qty: Qty;
  baseQty: number;
  baseUnit: BaseUnit;
  rate: number;
  amount: number;
  /** Stock is short of what was ordered. */
  shortBy?: number;
}

export interface Bill {
  id: string;
  shopName: string;
  buyerType: BuyerType;
  buyerName: string;
  buyerPhone: string;
  createdAt: string;
  lines: BillLine[];
  subtotal: number;
  roundOff: number;
  total: number;
  /** Things the buyer wanted that are not on the bill. */
  notAvailable: string[];
}

export interface PackingSlipLine {
  rack: string;
  name: string;
  pack: string;
  qty: string;
  note?: string;
}

export interface PackingSlip {
  billId: string;
  buyerName: string;
  lines: PackingSlipLine[];
}

export type InsightKind = "lost_sale" | "swap" | "brand_ask" | "not_stocked";

export interface InsightEvent {
  kind: InsightKind;
  at: string;
  buyerType: BuyerType;
  /** SKU asked for (or label for not-stocked items). */
  skuId?: string;
  label: string;
  brand?: string;
  /** For swaps: what the buyer took instead. */
  chosenSkuId?: string;
  reason?: string;
  qty?: Qty;
  /** Estimated rupee value lost. */
  value?: number;
  seeded?: boolean;
}

export interface ConfirmIssue {
  candidateId: string;
  label: string;
  problem: string;
}
