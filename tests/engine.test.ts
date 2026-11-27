import { describe, expect, it } from "vitest";
import { catalogue } from "../src/data/catalogue";
import { demoScripts } from "../src/data/scripts";
import {
  buildBill,
  buildPackingSlip,
  confirmIssues,
  createConversation,
  insightsFromCall,
  processTranscript,
  processUtterance,
  summarize,
  tokenize,
  whatsappLink,
  type BuyerType,
  type Candidate,
  type ConversationState,
  type Utterance,
} from "../src/engine";

const B = (text: string, confidence?: number): Utterance => ({ speaker: "buyer", text, confidence });
const S = (text: string): Utterance => ({ speaker: "seller", text });

async function run(lines: Utterance[], buyerType: BuyerType = "household"): Promise<ConversationState> {
  return processTranscript(createConversation(buyerType), lines, { catalogue });
}

function cand(state: ConversationState, skuId: string): Candidate {
  const c = state.candidates.find((x) => x.skuId === skuId);
  if (!c) throw new Error(`no candidate for ${skuId}: ${state.candidates.map((x) => x.skuId ?? x.label).join(", ")}`);
  return c;
}

function bill(state: ConversationState) {
  return buildBill(state, catalogue, { id: "PK-TEST", buyerName: "Test", buyerPhone: "9820012345", createdAt: "2026-11-27T10:00:00.000Z" });
}

describe("tokenizer", () => {
  it("maps Devanagari words and digits to Latin tokens", () => {
    expect(tokenize("कोलम ५ किलो दे दो")).toEqual(["kolam", "5", "kilo", "de", "do"]);
  });
  it("splits number-unit runs and hyphenated brands", () => {
    expect(tokenize("Parle-G 25kg, ₹95")).toEqual(["parle", "g", "25", "kg", ",", "rs", "95"]);
  });
});

describe("demo scripts", () => {
  it("(a) wholesaler decided order: converts bori and dabba, bills at wholesale rates", async () => {
    const sc = demoScripts.find((s) => s.id === "a")!;
    const s = await run(sc.lines, sc.buyerType);
    expect(s.phase).toBe("agreed");
    const b = bill(s);
    expect(b.lines.map((l) => [l.skuId, l.baseQty])).toEqual([
      ["rice-kolam", 50],
      ["salt-tata", 50],
      ["oil-fortune-sunflower", 30],
      ["sugar-loose", 50],
      ["biscuit-parle-g", 120],
      ["dal-toor", 25],
    ]);
    expect(b.total).toBe(15430);
  });

  it("(b) household: browse rice, reject Daawat on price, Kolam corrected 5 -> 10 kilo at read-back", async () => {
    const sc = demoScripts.find((s) => s.id === "b")!;
    const s = await run(sc.lines, sc.buyerType);
    expect(cand(s, "rice-daawat")).toMatchObject({ state: "rejected", reason: "price" });
    const kolam = cand(s, "rice-kolam");
    expect(kolam).toMatchObject({ state: "confirmed", qty: { value: 10, unit: "kg" } });
    expect(kolam.history.some((h) => h.note.includes("read-back correction"))).toBe(true);
    expect(s.readback).toBe("Toh final: Kolam 10 kilo, Tata namak 1 packet, Fortune tel 1 litre. Sahi hai?");
    const b = bill(s);
    expect(b.lines.map((l) => [l.name, l.amount])).toEqual([
      ["Wada Kolam Rice", 620],
      ["Tata Salt", 28],
      ["Fortune Sunlite Sunflower Oil", 165],
    ]);
    expect(b.total).toBe(813);
  });

  it("(c) out-of-stock brand ask becomes a lost sale; unknown product is recorded", async () => {
    const sc = demoScripts.find((s) => s.id === "c")!;
    const s = await run(sc.lines, sc.buyerType);
    expect(cand(s, "rice-india-gate")).toMatchObject({ state: "asked", unavailable: true, qty: { value: 5, unit: "kg" } });
    expect(cand(s, "rice-daawat")).toMatchObject({ state: "rejected", reason: "declined-substitute" });
    expect(s.candidates.find((c) => c.unknown)).toMatchObject({ label: "amul butter", qty: { value: 2 } });
    expect(bill(s).total).toBe(285);
    const ev = insightsFromCall(s, catalogue, "2026-11-27T10:00:00.000Z");
    expect(ev.find((e) => e.kind === "lost_sale")).toMatchObject({ skuId: "rice-india-gate", value: 750 });
    expect(ev.find((e) => e.kind === "not_stocked")).toMatchObject({ label: "amul butter" });
  });
});

describe("browsing", () => {
  it("'rice mein kya kya hai' opens a stock card with every rice, out-of-stock last with an alternative", async () => {
    const s = await run([B("Bhaiya, rice mein kya kya hai?")]);
    expect(s.candidates).toHaveLength(0);
    const card = s.stockCard!;
    expect(card.category).toBe("rice");
    expect(card.items).toHaveLength(7);
    const last = card.items[card.items.length - 1];
    expect(last).toMatchObject({ skuId: "rice-india-gate", inStock: false });
    expect(last.alternativeId).toBe("rice-kohinoor"); // basmati, closest price
    expect(card.items[0].inStock).toBe(true);
  });

  it("asking for an out-of-stock brand shows it greyed with in-stock alternatives", async () => {
    const s = await run([B("Dettol sabun hai kya?")]);
    expect(cand(s, "soap-dettol")).toMatchObject({ state: "asked", unavailable: true });
    const ids = s.stockCard!.items.map((i) => i.skuId);
    expect(ids).toContain("soap-dettol");
    expect(ids.length).toBeGreaterThan(1);
  });

  it("keeps the category card when the buyer then asks about one item on it", async () => {
    const s = await run([B("rice mein kya kya hai?"), B("Daawat kitne ka hai?")]);
    expect(s.stockCard?.items).toHaveLength(7);
  });

  it("works in Devanagari", async () => {
    const s = await run([B("चावल में क्या क्या है?")]);
    expect(s.stockCard?.category).toBe("rice");
  });

  it("uses wholesale prices on the stock card for a wholesaler call", async () => {
    const s = await run([B("tel kaun kaun sa hai?")], "wholesaler");
    expect(s.stockCard!.items.find((i) => i.skuId === "oil-fortune-sunflower")!.pricePerUnit).toBe(152);
  });
});

describe("rejections and brand switches", () => {
  it("'Basmati... actually nahi, Kolam hi de do' drops basmati and confirms Kolam", async () => {
    const s = await run([B("Basmati... actually nahi, Kolam hi de do")]);
    const basmati = s.candidates.find((c) => c.label === "basmati")!;
    expect(basmati.state).toBe("rejected");
    expect(cand(s, "rice-kolam").state).toBe("confirmed");
  });

  it("carries the quantity over when the buyer switches brand", async () => {
    const s = await run([B("Daawat 5 kilo de do"), B("nahi nahi, Daawat ki jagah Kolam kar do")]);
    expect(cand(s, "rice-daawat").state).toBe("rejected");
    expect(cand(s, "rice-kolam")).toMatchObject({ state: "confirmed", qty: { value: 5, unit: "kg" } });
  });

  it("price rejection: 'mehenga hai' rejects the item just discussed", async () => {
    const s = await run([B("Saffola kitne ka hai?"), S("Saffola 210 rupaye litre."), B("Bahut mehenga hai. Fortune tel 2 litre de do.")]);
    expect(cand(s, "oil-saffola-gold")).toMatchObject({ state: "rejected", reason: "price" });
    expect(cand(s, "oil-fortune-sunflower")).toMatchObject({ state: "confirmed", qty: { value: 2, unit: "litre" } });
  });

  it("'chalega' accepts the seller's single suggestion", async () => {
    const s = await run([B("Dettol hai kya?"), S("Dettol khatam hai, Lifebuoy hai."), B("Theek hai chalega, 4 piece.")]);
    expect(cand(s, "soap-lifebuoy")).toMatchObject({ state: "confirmed", qty: { value: 4, unit: "piece" } });
    expect(cand(s, "soap-dettol").state).toBe("asked");
  });

  it("a rejected item can come back on the order", async () => {
    const s = await run([B("Good Day 2 packet"), B("Good Day nahi"), B("acha Good Day de hi do")]);
    expect(cand(s, "biscuit-good-day").state).toBe("confirmed");
  });

  it("Marathi: 'nako' rejects and 'dya' confirms", async () => {
    const s = await run([B("Surf Excel nako, Tide 2 packet dya")]);
    expect(cand(s, "detergent-surf-excel").state).toBe("rejected");
    expect(cand(s, "detergent-tide")).toMatchObject({ state: "confirmed", qty: { value: 2, unit: "packet" } });
  });
});

describe("quantity corrections", () => {
  it("corrects during read-back and regenerates the read-back text", async () => {
    const s = await run([
      B("Toor dal 2 kilo, moong dal 1 kilo"),
      S("Toh final: toor dal 2 kilo, moong dal 1 kilo."),
      B("moong 1 nahi 2 kilo kar do"),
    ]);
    expect(s.phase).toBe("readback");
    expect(cand(s, "dal-moong").qty).toEqual({ value: 2, unit: "kg" });
    expect(s.readback).toContain("moong dal 2 kilo");
  });

  it("a correction after agreement reopens the read-back", async () => {
    const s = await run([B("Lux 3 piece de do"), S("Toh final: Lux 3 piece."), B("haan sahi hai"), B("Lux 5 piece kar do")]);
    expect(s.phase).toBe("readback");
    expect(cand(s, "soap-lux").qty).toEqual({ value: 5, unit: "piece" });
  });

  it("understands Hindi number words and fractions", async () => {
    const s = await run([B("cheeni dedh kilo aur poha aadha kilo de do")]);
    expect(cand(s, "sugar-loose").qty).toEqual({ value: 1.5, unit: "kg" });
    expect(cand(s, "poha-thick").qty).toEqual({ value: 0.5, unit: "kg" });
  });

  it("does not mistake prices for quantities", async () => {
    const s = await run([B("Kohinoor 135 rupaye kilo hai?")]);
    expect(cand(s, "rice-kohinoor").qty).toBeUndefined();
  });

  it("converts kilos of a packed atta into packets", async () => {
    const s = await run([B("Aashirvaad atta 10 kilo de do")]);
    expect(bill(s).lines[0]).toMatchObject({ baseQty: 2, baseUnit: "packet", amount: 570 });
  });
});

describe("ambiguous matches", () => {
  it("'basmati 5 kilo de do' stays ambiguous until the buyer names one", async () => {
    let s = await run([B("basmati 5 kilo de do")]);
    const amb = s.candidates[0];
    expect(amb).toMatchObject({ skuId: null, state: "confirmed", needs: ["sku"] });
    expect(amb.options).toEqual(["rice-india-gate", "rice-daawat", "rice-kohinoor"]);
    expect(confirmIssues(s, catalogue)[0].problem).toMatch(/ambiguous/);
    expect(s.readback).toBeNull();
    s = (await processUtterance(s, B("Kohinoor wala"), { catalogue })).state;
    expect(s.candidates).toHaveLength(1);
    expect(s.candidates[0]).toMatchObject({ skuId: "rice-kohinoor", state: "confirmed", qty: { value: 5, unit: "kg" }, needs: [] });
  });

  it("brand + category narrows to one SKU ('Tata namak' is salt, not tea)", async () => {
    const s = await run([B("Tata namak 3 packet, Tata chai patti 1 packet")]);
    expect(cand(s, "salt-tata").qty).toEqual({ value: 3, unit: "packet" });
    expect(cand(s, "tea-tata-gold").qty).toEqual({ value: 1, unit: "packet" });
  });

  it("a category word on its own targets the one item of that category already ordered", async () => {
    const s = await run([B("Sona Masoori 5 kilo"), B("chawal 8 kilo kar do")]);
    expect(s.candidates).toHaveLength(1);
    expect(cand(s, "rice-sona-masoori").qty).toEqual({ value: 8, unit: "kg" });
  });

  it("tolerates a one-letter speech-recognition typo", async () => {
    const s = await run([B("Pillsbary atta 1 packet")]);
    expect(cand(s, "atta-pillsbury-5").state).toBe("confirmed");
  });
});

describe("missing quantity or unit", () => {
  it("missing quantity: confirmed but flagged, blocks the bill", async () => {
    const s = await run([B("Kolam de do")]);
    expect(cand(s, "rice-kolam")).toMatchObject({ state: "confirmed", needs: ["qty"] });
    expect(confirmIssues(s, catalogue).map((i) => i.problem)).toContain("quantity not said");
  });

  it("a quantity in the next line fills it in", async () => {
    const s = await run([B("Kolam de do"), S("Kitna?"), B("10 kilo")]);
    expect(cand(s, "rice-kolam")).toMatchObject({ qty: { value: 10, unit: "kg" }, needs: [] });
  });

  it("bare number: assumes the base unit and says so", async () => {
    const s = await run([B("Tata namak 10 de do")]);
    expect(cand(s, "salt-tata")).toMatchObject({ qty: { value: 10, unit: "packet" }, unitAssumed: true });
  });

  it("a unit the product is not sold in is flagged", async () => {
    const s = await run([B("Lux 2 litre de do")]);
    expect(confirmIssues(s, catalogue).map((i) => i.problem)).toContain("cannot sell Lux Soap by litre");
  });
});

describe("unknown products", () => {
  it("records a product not in the catalogue without billing it", async () => {
    const s = await run([B("Maggi 4 packet bhi de do")]);
    expect(s.candidates[0]).toMatchObject({ unknown: true, label: "maggi", qty: { value: 4, unit: "packet" } });
    expect(confirmIssues(s, catalogue).map((i) => i.problem)).toContain("nothing confirmed yet");
  });

  it("'X hai kya?' for an unknown product is an ask", async () => {
    const s = await run([B("Nutella hai kya?")]);
    expect(s.candidates[0]).toMatchObject({ unknown: true, label: "nutella" });
  });

  it("greetings and chit-chat do not create items", async () => {
    const s = await run([B("Namaste bhaiya, kaise ho?"), B("Kal subah tak bhej dena")]);
    expect(s.candidates).toHaveLength(0);
  });
});

describe("low-confidence speech", () => {
  it("ignores very low-confidence lines and warns", async () => {
    const s = await run([B("Kolam 50 kilo de do", 0.3)]);
    expect(s.candidates).toHaveLength(0);
    expect(s.transcript[0]).toMatchObject({ ignored: true });
    expect(s.warnings[0]).toMatch(/unclearly/);
  });

  it("applies medium-confidence lines but flags the item for review", async () => {
    const s = await run([B("Kolam 5 kilo de do", 0.6), B("Tata namak 1 packet", 0.95)]);
    expect(cand(s, "rice-kolam")).toMatchObject({ state: "confirmed", needsReview: true });
    expect(cand(s, "salt-tata").needsReview).toBeUndefined();
  });
});

describe("conversation focus (review regressions)", () => {
  it("an unclear line between the seller's offer and 'chalega' does not lose the offer", async () => {
    const s = await run([B("Dettol hai kya?"), S("Dettol khatam hai, Lifebuoy hai."), B("hmm hmm", 0.2), B("chalega, 2 piece")]);
    expect(cand(s, "soap-lifebuoy")).toMatchObject({ state: "confirmed", qty: { value: 2, unit: "piece" } });
  });

  it("'rehne do' after an unknown product drops that product, not the previous item", async () => {
    const s = await run([B("Kolam 5 kilo de do"), B("Maggi 4 packet bhi de do"), B("nahi rehne do")]);
    expect(cand(s, "rice-kolam").state).toBe("confirmed");
    expect(s.candidates.find((c) => c.unknown)?.state).toBe("rejected");
  });

  it("quantity carries over from the most recent rejection, not the first one created", async () => {
    const s = await run([B("Kohinoor 3 kilo"), B("Daawat 7 kilo"), B("Daawat nahi, Kohinoor nahi"), B("Kolam de do")]);
    expect(cand(s, "rice-kolam").qty).toEqual({ value: 3, unit: "kg" });
  });

  it("an out-of-stock item is never counted as bought in brand asks", async () => {
    const s = await run([B("basmati 2 kilo de do"), B("India Gate wala")]);
    const ev = insightsFromCall(s, catalogue, "2026-11-27T10:00:00.000Z").find((e) => e.kind === "brand_ask");
    expect(ev?.reason).toBe("asked");
  });
});

describe("seller lines", () => {
  it("never confirm anything on their own", async () => {
    const s = await run([S("Kolam 25 kilo, Tata namak 10 packet de deta hoon")]);
    expect(s.candidates).toHaveLength(0);
  });
  it("'toh final' starts the read-back", async () => {
    const s = await run([B("Lux 2 piece de do"), S("Toh final: Lux 2 piece.")]);
    expect(s.phase).toBe("readback");
    expect(s.readback).toBe("Toh final: Lux 2 piece. Sahi hai?");
  });
});

describe("bill, packing slip and WhatsApp", () => {
  it("rounds off, sorts the packing slip by rack and builds a wa.me link", async () => {
    const sc = demoScripts.find((x) => x.id === "b")!;
    const s = await run(sc.lines, sc.buyerType);
    const b = bill(s);
    const slip = buildPackingSlip(b, catalogue);
    expect(slip.lines.map((l) => l.rack)).toEqual(["A2", "D1", "E1"]);
    const link = whatsappLink(b);
    expect(link.startsWith("https://wa.me/919820012345?text=")).toBe(true);
    expect(decodeURIComponent(link.split("text=")[1])).toContain("Total: ₹813");
  });

  it("flags stock shortfalls on the bill", async () => {
    const s = await run([B("Kohinoor 20 kilo de do")]);
    expect(bill(s).lines[0].shortBy).toBe(5);
  });
});

describe("daily insights", () => {
  it("aggregates lost sales, swaps and brand asks", async () => {
    const at = "2026-11-27T10:00:00.000Z";
    const events = [];
    for (const sc of demoScripts) events.push(...insightsFromCall(await run(sc.lines, sc.buyerType), catalogue, at));
    const d = summarize(events, catalogue, "2026-11-27");
    expect(d.lostSalesValue).toBe(750);
    expect(d.lostSales[0]).toMatchObject({ label: "India Gate Classic Basmati", asks: 1 });
    expect(d.swaps[0]).toMatchObject({ from: "Daawat Rozana Basmati", to: "Wada Kolam Rice", reason: "price" });
    expect(d.notStocked[0]).toMatchObject({ label: "amul butter" });
    expect(d.brandAsks.find((r) => r.brand === "Daawat")).toMatchObject({ asks: 2, bought: 0 });
  });
});
