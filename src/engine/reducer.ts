import type {
  Action,
  BuyerType,
  Candidate,
  Catalogue,
  ConversationState,
  ItemRef,
  NeedsFlag,
  Qty,
  RejectReason,
} from "./types";
import { buildStockCard, categoryLabel, skuById } from "./stock";
import { buildReadback } from "./readback";

// Pure reducer: (state, actions) -> new state. All conversation memory lives
// here: candidate states, quantities, corrections, focus for "chalega"/"nahi"
// without a product name, and the read-back text.

export function createConversation(buyerType: BuyerType): ConversationState {
  return {
    buyerType,
    transcript: [],
    candidates: [],
    stockCard: null,
    phase: "ordering",
    readback: null,
    focusId: null,
    suggestion: null,
    warnings: [],
    nextCandidateId: 1,
  };
}

function qtyText(q?: Qty): string {
  if (!q) return "no qty";
  return `${q.value}${q.unit ? " " + q.unit : ""}`;
}

const ACTIVE = (c: Candidate) => c.state !== "rejected";

interface Ctx {
  catalogue: Catalogue;
  index: number;
  touched: Set<string>;
  /** Order of rejections within this line, so "most recent" survives several rejections in one line. */
  seq: number;
}

function note(c: Candidate, ctx: Ctx, text: string, state: ConversationState) {
  const suffix = state.phase !== "ordering" ? " (read-back correction)" : "";
  c.history.push({ utterance: ctx.index, note: text + suffix });
  ctx.touched.add(c.id);
}

function computeNeeds(c: Candidate): NeedsFlag[] {
  const needs: NeedsFlag[] = [];
  if (!c.unknown && !c.skuId) needs.push("sku");
  if (c.state === "confirmed" && !c.qty) needs.push("qty");
  return needs;
}

/** Find the candidate a reference points at, if any. */
function findCandidate(state: ConversationState, ref: ItemRef): Candidate | undefined {
  if (ref.skuIds.length === 1) {
    const id = ref.skuIds[0];
    const exact = state.candidates.find((c) => c.skuId === id);
    if (exact) return exact;
    // Resolves an earlier ambiguous mention: "basmati" ... "Kohinoor"
    return state.candidates.find((c) => !c.skuId && ACTIVE(c) && c.options?.includes(id));
  }
  if (ref.skuIds.length > 1) {
    const set = new Set(ref.skuIds);
    const sameAmbiguous = state.candidates.find((c) => !c.skuId && c.options?.join() === ref.skuIds.join());
    if (sameAmbiguous) return sameAmbiguous;
    // "chawal 10 kilo kar do" when exactly one rice is on the order
    const active = state.candidates.filter((c) => c.skuId && set.has(c.skuId) && ACTIVE(c));
    if (active.length === 1) return active[0];
  }
  return undefined;
}

function labelFor(ctx: Ctx, ref: ItemRef): string {
  if (ref.skuIds.length === 1) return skuById(ctx.catalogue, ref.skuIds[0])?.spoken ?? ref.label;
  return ref.label;
}

function createCandidate(state: ConversationState, ref: ItemRef, ctx: Ctx): Candidate {
  const single = ref.skuIds.length === 1 ? ref.skuIds[0] : null;
  const c: Candidate = {
    id: `c${state.nextCandidateId++}`,
    skuId: single,
    label: labelFor(ctx, ref),
    category: ref.category ?? (single ? skuById(ctx.catalogue, single)?.category : undefined),
    state: "asked",
    options: single ? undefined : ref.skuIds,
    needs: [],
    history: [],
  };
  if (single && (skuById(ctx.catalogue, single)?.stock ?? 0) === 0) c.unavailable = true;
  state.candidates.push(c);
  note(c, ctx, `mentioned "${ref.label}"`, state);
  return c;
}

function upsert(state: ConversationState, ref: ItemRef, ctx: Ctx): Candidate {
  const found = findCandidate(state, ref);
  if (!found) return createCandidate(state, ref, ctx);
  if (!found.skuId && ref.skuIds.length === 1) {
    const sku = skuById(ctx.catalogue, ref.skuIds[0]);
    found.skuId = ref.skuIds[0];
    found.options = undefined;
    found.label = sku?.spoken ?? ref.label;
    found.unavailable = (sku?.stock ?? 0) === 0 || undefined;
    note(found, ctx, `resolved to ${sku?.name ?? ref.label}`, state);
  }
  return found;
}

function setQty(c: Candidate, qty: Qty, ctx: Ctx, state: ConversationState) {
  if (c.qty && c.qty.value === qty.value && (c.qty.unit ?? null) === (qty.unit ?? null)) return;
  const sku = c.skuId ? skuById(ctx.catalogue, c.skuId) : undefined;
  const filled: Qty = { ...qty };
  c.unitAssumed = undefined;
  if (!filled.unit && sku) {
    filled.unit = sku.baseUnit;
    c.unitAssumed = true;
  } else if (!filled.unit && c.qty?.unit) {
    filled.unit = c.qty.unit;
  }
  note(c, ctx, c.qty ? `qty ${qtyText(c.qty)} -> ${qtyText(filled)}` : `qty ${qtyText(filled)}${c.unitAssumed ? " (unit assumed)" : ""}`, state);
  c.qty = filled;
}

/** Most recently rejected candidate in the same category, from this or the previous buyer line. */
function recentlyRejected(state: ConversationState, c: Candidate, ctx: Ctx): Candidate | undefined {
  return state.candidates
    .filter(
      (o) =>
        o !== c &&
        o.state === "rejected" &&
        o.qty &&
        o.category === c.category &&
        (o.rejectedAt ?? -1) >= (ctx.index - 2) * 1000,
    )
    .sort((a, b) => (b.rejectedAt ?? 0) - (a.rejectedAt ?? 0))[0];
}

function confirm(state: ConversationState, c: Candidate, qty: Qty | undefined, ctx: Ctx) {
  if (qty) setQty(c, qty, ctx, state);
  if (!c.qty) {
    const prev = recentlyRejected(state, c, ctx);
    if (prev?.qty) {
      setQty(c, prev.qty, ctx, state);
      note(c, ctx, `qty carried over from ${prev.label}`, state);
    }
  }
  if (c.unavailable) {
    // Wanted, but cannot be billed: stays "asked" and later becomes a lost-sale insight.
    note(c, ctx, "wanted but out of stock", state);
    if (c.state === "rejected") c.state = "asked";
  } else if (c.state !== "confirmed") {
    note(c, ctx, c.state === "rejected" ? "back on the order" : "confirmed", state);
    c.state = "confirmed";
    c.reason = undefined;
  }
  state.focusId = c.id;
}

function reject(state: ConversationState, c: Candidate, reason: RejectReason, ctx: Ctx) {
  if (c.state === "rejected" && c.reason === reason) return;
  note(c, ctx, `rejected (${reason})`, state);
  c.state = "rejected";
  c.reason = reason;
  c.rejectedAt = ctx.index * 1000 + ctx.seq++;
  if (state.focusId === c.id) {
    const other = [...state.candidates].reverse().find((o) => o.id !== c.id && ACTIVE(o));
    state.focusId = other?.id ?? null;
  }
}

function setCard(state: ConversationState, ctx: Ctx, skuIds: string[], title: string) {
  // Keep a category card that already lists these items ("rice mein kya kya hai" then "Daawat?").
  const shown = new Set(state.stockCard?.items.map((i) => i.skuId) ?? []);
  if (state.stockCard && state.stockCard.items.length > skuIds.length && skuIds.every((id) => shown.has(id))) return;
  state.stockCard = buildStockCard(ctx.catalogue, skuIds, state.buyerType, title, ctx.index);
}

/** The thing a nameless "chalega" / "nahi" refers to. */
function focusTarget(state: ConversationState, ctx: Ctx): { candidate?: Candidate; suggestionSku?: string } {
  if (state.suggestion) {
    // The offer must be the last line actually heard; ignored (unclear) lines in between do not count.
    const between = state.transcript.filter((l) => l.index > state.suggestion!.utterance && l.index < ctx.index);
    if (between.every((l) => l.ignored)) return { suggestionSku: state.suggestion.skuId };
  }
  const c = state.candidates.find((x) => x.id === state.focusId);
  return { candidate: c };
}

function skuRef(ctx: Ctx, skuId: string): ItemRef {
  const sku = skuById(ctx.catalogue, skuId);
  return { label: sku?.spoken ?? skuId, skuIds: [skuId], category: sku?.category };
}

function applyOne(state: ConversationState, a: Action, ctx: Ctx) {
  switch (a.type) {
    case "browse": {
      const title = a.skuIds.length && a.category ? `${a.label} — ${categoryLabel(ctx.catalogue, a.category)} in stock` : a.label;
      setCard(state, ctx, a.skuIds, title);
      return;
    }
    case "ask": {
      const c = upsert(state, a.ref, ctx);
      if (c.state === "rejected") {
        c.state = "asked";
        c.reason = undefined;
        note(c, ctx, "asked about again", state);
      }
      if (a.qty && c.state !== "confirmed") setQty(c, a.qty, ctx, state);
      state.focusId = c.id;
      if (a.ref.skuIds.length) setCard(state, ctx, c.skuId ? [c.skuId] : a.ref.skuIds, a.ref.label);
      return;
    }
    case "confirm": {
      const c = upsert(state, a.ref, ctx);
      confirm(state, c, a.qty, ctx);
      if (c.unavailable && c.skuId) setCard(state, ctx, [c.skuId], `${c.label} — out of stock`);
      return;
    }
    case "reject": {
      const c = upsert(state, a.ref, ctx);
      reject(state, c, a.reason, ctx);
      return;
    }
    case "set_qty": {
      const c = upsert(state, a.ref, ctx);
      if (c.state === "rejected") return;
      confirm(state, c, a.qty, ctx);
      return;
    }
    case "accept_focus": {
      const t = focusTarget(state, ctx);
      if (t.suggestionSku) confirm(state, upsert(state, skuRef(ctx, t.suggestionSku), ctx), a.qty, ctx);
      else if (t.candidate && ACTIVE(t.candidate)) confirm(state, t.candidate, a.qty, ctx);
      return;
    }
    case "reject_focus": {
      const t = focusTarget(state, ctx);
      if (t.suggestionSku) {
        // Turning down something the seller offered in place of the buyer's ask is a declined substitute;
        // turning down the buyer's own item after the seller quotes it keeps the buyer's reason ("mehenga").
        const own = state.candidates.some((c) => c.skuId === t.suggestionSku);
        reject(state, upsert(state, skuRef(ctx, t.suggestionSku), ctx), own ? a.reason : "declined-substitute", ctx);
      }
      else if (t.candidate) reject(state, t.candidate, a.reason, ctx);
      return;
    }
    case "set_focus_qty": {
      const t = focusTarget(state, ctx);
      const c = t.suggestionSku ? upsert(state, skuRef(ctx, t.suggestionSku), ctx) : t.candidate;
      if (c && ACTIVE(c)) confirm(state, c, a.qty, ctx);
      return;
    }
    case "suggest": {
      const fresh = [...new Set(a.skuIds)].filter((id) => {
        const sku = skuById(ctx.catalogue, id);
        const cand = state.candidates.find((c) => c.skuId === id);
        // Re-offering something only asked about still counts; an item already confirmed does not.
        return sku && sku.stock > 0 && cand?.state !== "confirmed";
      });
      state.suggestion = fresh.length === 1 ? { skuId: fresh[0], utterance: ctx.index } : null;
      return;
    }
    case "unknown_product": {
      let c = state.candidates.find((x) => x.unknown && x.label === a.label);
      if (!c) {
        c = {
          id: `c${state.nextCandidateId++}`,
          skuId: null,
          label: a.label,
          state: "asked",
          unknown: true,
          needs: [],
          history: [],
        };
        state.candidates.push(c);
        note(c, ctx, `asked for "${a.label}" — not in catalogue`, state);
      }
      if (a.qty) setQty(c, a.qty, ctx, state);
      state.focusId = c.id;
      return;
    }
    case "readback":
      state.phase = "readback";
      return;
    case "agree":
      if (state.candidates.some((c) => c.state === "confirmed")) state.phase = "agreed";
      return;
  }
}

export interface ReduceOptions {
  catalogue: Catalogue;
  /** Transcript index of the line that produced these actions. */
  index: number;
  /** Mark candidates touched by this line as needing review (low-confidence speech). */
  review?: boolean;
}

export function reduce(prev: ConversationState, actions: Action[], opts: ReduceOptions): ConversationState {
  const state: ConversationState = structuredClone(prev);
  const ctx: Ctx = { catalogue: opts.catalogue, index: opts.index, touched: new Set(), seq: 0 };
  const phaseBefore = state.phase;
  for (const a of actions) applyOne(state, a, ctx);
  // Any change after the buyer agreed reopens the read-back.
  if (phaseBefore === "agreed" && ctx.touched.size && !actions.some((a) => a.type === "agree")) state.phase = "readback";
  for (const c of state.candidates) {
    c.needs = computeNeeds(c);
    if (opts.review && ctx.touched.has(c.id)) c.needsReview = true;
  }
  if (state.phase !== "ordering") state.readback = buildReadback(state, opts.catalogue);
  return state;
}
