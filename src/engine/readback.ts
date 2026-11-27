import type { Catalogue, ConversationState, Qty } from "./types";
import { UNIT_SPOKEN } from "./lexicon";
import { skuById } from "./stock";

export function spokenQty(q: Qty | undefined): string {
  if (!q) return "";
  const n = Number.isInteger(q.value) ? String(q.value) : String(Math.round(q.value * 100) / 100);
  return q.unit ? `${n} ${UNIT_SPOKEN[q.unit]}` : n;
}

/**
 * The read-back the shopkeeper says before confirming, e.g.
 * "Toh final: Kolam 10 kilo, Tata namak 1 packet, Fortune tel 1 litre. Sahi hai?"
 */
export function buildReadback(state: ConversationState, catalogue: Catalogue): string {
  const confirmed = state.candidates.filter((c) => c.state === "confirmed" && !c.unavailable && !c.unknown);
  const parts: string[] = [];
  const items = confirmed.map((c) => {
    const qty = c.qty ? spokenQty(c.qty) : "kitna?";
    if (!c.skuId && c.options?.length) {
      const names = c.options.map((id) => skuById(catalogue, id)?.spoken ?? id).join(" ya ");
      return `${c.label} ${qty} (kaunsa: ${names}?)`;
    }
    return `${c.label} ${qty}`;
  });
  parts.push(items.length ? `Toh final: ${items.join(", ")}.` : "Abhi kuch confirm nahi hua.");
  const missing = state.candidates.filter((c) => c.state !== "rejected" && c.unavailable);
  if (missing.length) parts.push(`${missing.map((c) => c.label).join(", ")} abhi stock mein nahi hai.`);
  const unknown = state.candidates.filter((c) => c.state !== "rejected" && c.unknown);
  if (unknown.length) parts.push(`${unknown.map((c) => c.label).join(", ")} hum nahi rakhte.`);
  if (items.length) parts.push("Sahi hai?");
  return parts.join(" ");
}
