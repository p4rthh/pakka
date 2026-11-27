import type { Bill, BillLine, Catalogue, ConfirmIssue, ConversationState, PackingSlip } from "./types";
import { rateFor, skuById, toBaseQty } from "./stock";
import { spokenQty } from "./readback";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Problems that must be fixed (or overridden) before the shopkeeper's Confirm produces a bill. */
export function confirmIssues(state: ConversationState, catalogue: Catalogue): ConfirmIssue[] {
  const issues: ConfirmIssue[] = [];
  for (const c of state.candidates) {
    if (c.state !== "confirmed") continue;
    if (!c.skuId) {
      issues.push({ candidateId: c.id, label: c.label, problem: "which product? (ambiguous)" });
      continue;
    }
    if (!c.qty) {
      issues.push({ candidateId: c.id, label: c.label, problem: "quantity not said" });
      continue;
    }
    const sku = skuById(catalogue, c.skuId);
    if (sku && toBaseQty(sku, c.qty) === null) {
      issues.push({ candidateId: c.id, label: c.label, problem: `cannot sell ${sku.name} by ${c.qty.unit}` });
    }
  }
  if (!state.candidates.some((c) => c.state === "confirmed" && c.skuId && !c.unavailable)) {
    issues.push({ candidateId: "", label: "order", problem: "nothing confirmed yet" });
  }
  return issues;
}

export interface BillMeta {
  id: string;
  buyerName: string;
  buyerPhone: string;
  createdAt: string;
}

export function buildBill(state: ConversationState, catalogue: Catalogue, meta: BillMeta): Bill {
  const lines: BillLine[] = [];
  for (const c of state.candidates) {
    if (c.state !== "confirmed" || !c.skuId || !c.qty || c.unavailable) continue;
    const sku = skuById(catalogue, c.skuId);
    if (!sku) continue;
    const baseQty = toBaseQty(sku, c.qty);
    if (baseQty === null) continue;
    const rate = rateFor(sku, state.buyerType);
    lines.push({
      skuId: sku.id,
      name: sku.name,
      qty: c.qty,
      baseQty,
      baseUnit: sku.baseUnit,
      rate,
      amount: round2(baseQty * rate),
      shortBy: baseQty > sku.stock ? round2(baseQty - sku.stock) : undefined,
    });
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const total = Math.round(subtotal);
  const notAvailable = state.candidates
    .filter((c) => c.state !== "rejected" && (c.unavailable || c.unknown))
    .map((c) => `${c.label}${c.qty ? " " + spokenQty(c.qty) : ""}${c.unknown ? " (not stocked)" : " (out of stock)"}`);
  return {
    id: meta.id,
    shopName: catalogue.shopName[state.buyerType],
    buyerType: state.buyerType,
    buyerName: meta.buyerName,
    buyerPhone: meta.buyerPhone,
    createdAt: meta.createdAt,
    lines,
    subtotal,
    roundOff: round2(total - subtotal),
    total,
    notAvailable,
  };
}

/** Packing slip sorted by rack so the helper walks the shop once. */
export function buildPackingSlip(bill: Bill, catalogue: Catalogue): PackingSlip {
  const lines = bill.lines
    .map((l) => {
      const sku = skuById(catalogue, l.skuId)!;
      const converted = l.qty.unit && l.qty.unit !== sku.baseUnit ? ` (= ${l.baseQty} ${sku.baseUnit})` : "";
      return {
        rack: sku.rack,
        name: sku.name,
        pack: sku.pack,
        qty: `${spokenQty(l.qty)}${converted}`,
        note: l.shortBy ? `short by ${l.shortBy} ${sku.baseUnit}` : undefined,
      };
    })
    .sort((a, b) => a.rack.localeCompare(b.rack));
  return { billId: bill.id, buyerName: bill.buyerName, lines };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function whatsappText(bill: Bill): string {
  const rows = bill.lines.map((l) => `• ${l.name} — ${spokenQty(l.qty)} — ${inr(l.amount)}`);
  const parts = [
    `*${bill.shopName}*`,
    `Order ${bill.id} pakka ho gaya.`,
    "",
    ...rows,
    "",
    `*Total: ${inr(bill.total)}*`,
  ];
  if (bill.notAvailable.length) parts.push("", `Abhi nahi hai: ${bill.notAvailable.join(", ")}`);
  parts.push("", "Dhanyavaad!");
  return parts.join("\n");
}

/** Click-to-chat link (no WhatsApp API needed). Indian 10-digit numbers get the 91 prefix. */
export function whatsappLink(bill: Bill): string {
  let digits = bill.buyerPhone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(whatsappText(bill))}`;
}
