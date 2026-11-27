import type { Catalogue, ConversationState, InsightEvent, Qty } from "./types";
import { rateFor, skuById, toBaseQty } from "./stock";

// Hesitation becomes data: what buyers asked for and did not get, what they
// swapped and why, and which brands they name.

/** Insight events from one finished call. */
export function insightsFromCall(state: ConversationState, catalogue: Catalogue, at: string): InsightEvent[] {
  const events: InsightEvent[] = [];
  const confirmed = state.candidates.filter((c) => c.state === "confirmed" && c.skuId && !c.unavailable);
  const confirmedIn = (category?: string) => confirmed.find((c) => c.category === category);

  for (const c of state.candidates) {
    const sku = c.skuId ? skuById(catalogue, c.skuId) : undefined;
    if (c.unknown) {
      events.push({ kind: "not_stocked", at, buyerType: state.buyerType, label: c.label, qty: c.qty });
      continue;
    }
    if (!sku) continue;
    if (sku.brand !== "Loose") {
      events.push({ kind: "brand_ask", at, buyerType: state.buyerType, skuId: sku.id, label: sku.name, brand: sku.brand, reason: c.state });
    }
    if (c.unavailable && c.state !== "rejected") {
      const chosen = confirmedIn(sku.category);
      if (chosen) {
        events.push({ kind: "swap", at, buyerType: state.buyerType, skuId: sku.id, label: sku.name, brand: sku.brand, chosenSkuId: chosen.skuId!, reason: "out of stock", qty: c.qty });
      } else {
        events.push({ kind: "lost_sale", at, buyerType: state.buyerType, skuId: sku.id, label: sku.name, brand: sku.brand, reason: "out of stock", qty: c.qty, value: estimateValue(catalogue, sku.id, c.qty, state) });
      }
      continue;
    }
    if (c.state === "rejected" && (c.reason === "price" || c.reason === "swapped" || c.reason === "changed-mind")) {
      const chosen = confirmedIn(sku.category);
      if (chosen && chosen.skuId !== sku.id) {
        events.push({ kind: "swap", at, buyerType: state.buyerType, skuId: sku.id, label: sku.name, brand: sku.brand, chosenSkuId: chosen.skuId!, reason: c.reason === "price" ? "price" : "preference" });
      }
    }
  }
  return events;
}

function estimateValue(catalogue: Catalogue, skuId: string, qty: Qty | undefined, state: ConversationState): number {
  const sku = skuById(catalogue, skuId)!;
  const base = qty ? toBaseQty(sku, qty) ?? 1 : 1;
  return Math.round(base * rateFor(sku, state.buyerType));
}

export interface DailyInsights {
  date: string;
  lostSalesValue: number;
  lostSales: Array<{ label: string; brand?: string; asks: number; value: number }>;
  notStocked: Array<{ label: string; asks: number }>;
  swaps: Array<{ from: string; to: string; reason: string; count: number }>;
  brandAsks: Array<{ brand: string; asks: number; bought: number }>;
  events: number;
}

export function summarize(events: InsightEvent[], catalogue: Catalogue, date: string): DailyInsights {
  const day = events.filter((e) => e.at.slice(0, 10) === date);
  const lost = new Map<string, { label: string; brand?: string; asks: number; value: number }>();
  const notStocked = new Map<string, { label: string; asks: number }>();
  const swaps = new Map<string, { from: string; to: string; reason: string; count: number }>();
  const brands = new Map<string, { brand: string; asks: number; bought: number }>();
  for (const e of day) {
    if (e.kind === "lost_sale") {
      const row = lost.get(e.label) ?? { label: e.label, brand: e.brand, asks: 0, value: 0 };
      row.asks++;
      row.value += e.value ?? 0;
      lost.set(e.label, row);
    } else if (e.kind === "not_stocked") {
      const row = notStocked.get(e.label) ?? { label: e.label, asks: 0 };
      row.asks++;
      notStocked.set(e.label, row);
    } else if (e.kind === "swap") {
      const to = e.chosenSkuId ? skuById(catalogue, e.chosenSkuId)?.name ?? e.chosenSkuId : "?";
      const key = `${e.label}>${to}>${e.reason}`;
      const row = swaps.get(key) ?? { from: e.label, to, reason: e.reason ?? "", count: 0 };
      row.count++;
      swaps.set(key, row);
    } else if (e.kind === "brand_ask" && e.brand) {
      const row = brands.get(e.brand) ?? { brand: e.brand, asks: 0, bought: 0 };
      row.asks++;
      if (e.reason === "confirmed") row.bought++;
      brands.set(e.brand, row);
    }
  }
  const lostSales = [...lost.values()].sort((a, b) => b.value - a.value);
  return {
    date,
    lostSalesValue: lostSales.reduce((s, r) => s + r.value, 0),
    lostSales,
    notStocked: [...notStocked.values()].sort((a, b) => b.asks - a.asks),
    swaps: [...swaps.values()].sort((a, b) => b.count - a.count),
    brandAsks: [...brands.values()].sort((a, b) => b.asks - a.asks),
    events: day.length,
  };
}
