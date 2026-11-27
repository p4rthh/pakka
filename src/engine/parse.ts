import type { Catalogue, ItemRef, Qty, Unit } from "./types";
import {
  CUES,
  DEVANAGARI,
  JOINERS,
  NUMBER_WORDS,
  PRICE_AFTER,
  PRICE_BEFORE,
  UNIT_WORDS,
  WEAK_NUMBER_WORDS,
  type CueKind,
} from "./lexicon";

// Turns raw speech text into clauses of typed elements: product mentions,
// quantities, prices, intent cues and leftover words. No intent decisions are
// made here; see rules.ts for that.

export type Element =
  | { k: "mention"; ref: ItemRef }
  | { k: "qty"; qty: Qty }
  | { k: "price"; value: number }
  | { k: "cue"; cue: CueKind; text: string }
  | { k: "word"; w: string };

export interface Clause {
  els: Element[];
  /** Ended with a question mark. */
  question: boolean;
}

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const PUNCT = /[,.!?;:।|…"“”()\[\]]/;
const VARIANT_TAGS = new Set(["basmati", "sunflower", "mustard"]);

/** Lowercase, split and map Devanagari to Latin. Punctuation becomes its own token. */
export function tokenize(text: string): string[] {
  let s = text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  s = s.toLowerCase();
  s = s.replace(/₹\s*/g, " rs ");
  s = s.replace(/\.{2,}/g, " … ");
  // "25kg" -> "25 kg", but keep decimals like "2.5"
  s = s.replace(/(\d)([a-zऀ-ॿ])/g, "$1 $2");
  s = s.replace(/([a-z])-([a-z])/g, "$1 $2");
  s = s.replace(/(\d)\.(?!\d)/g, "$1 .");
  s = s.replace(/([,!?;:।|…"“”()\[\]])/g, " $1 ");
  s = s.replace(/(^|[^\d])\.(?!\d)/g, "$1 . ");
  s = s.replace(/[’']/g, "");
  const out: string[] = [];
  for (const raw of s.split(/\s+/)) {
    if (!raw) continue;
    const mapped = DEVANAGARI[raw];
    if (mapped) out.push(...mapped.split(" "));
    else out.push(raw);
  }
  return out;
}

interface IndexEntry {
  skuIds: Set<string>;
  category: boolean;
}

interface ProductIndex {
  phrases: Map<string, IndexEntry>;
  maxLen: number;
  /** Single-word phrases of length >= 6, for one-typo fuzzy matching. */
  fuzzy: string[];
  categoryOf: Map<string, string>;
}

const indexCache = new WeakMap<Catalogue, ProductIndex>();

function addPhrase(idx: ProductIndex, phrase: string, skuIds: string[], category: boolean) {
  const key = tokenize(phrase).join(" ");
  if (!key) return;
  const entry = idx.phrases.get(key) ?? { skuIds: new Set<string>(), category };
  for (const id of skuIds) entry.skuIds.add(id);
  // A phrase that is both a category word and an item alias is treated as an item.
  entry.category = entry.category && category;
  idx.phrases.set(key, entry);
  idx.maxLen = Math.max(idx.maxLen, key.split(" ").length);
}

export function productIndex(catalogue: Catalogue): ProductIndex {
  const cached = indexCache.get(catalogue);
  if (cached) return cached;
  const idx: ProductIndex = { phrases: new Map(), maxLen: 1, fuzzy: [], categoryOf: new Map() };
  for (const sku of catalogue.skus) {
    idx.categoryOf.set(sku.id, sku.category);
    for (const alias of sku.aliases) addPhrase(idx, alias, [sku.id], false);
    if (sku.brand !== "Loose") addPhrase(idx, sku.brand, [sku.id], false);
    for (const tag of sku.tags) if (VARIANT_TAGS.has(tag)) addPhrase(idx, tag, [sku.id], false);
  }
  for (const cat of catalogue.categories) {
    const ids = catalogue.skus.filter((s) => s.category === cat.id).map((s) => s.id);
    for (const w of cat.words) addPhrase(idx, w, ids, true);
  }
  idx.fuzzy = [...idx.phrases.keys()].filter((k) => !k.includes(" ") && k.length >= 6);
  indexCache.set(catalogue, idx);
  return idx;
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function parseNumberToken(tok: string): number | null {
  if (/^\d+(\.\d+)?$/.test(tok)) return Number(tok);
  return null;
}

/** Number at position i (digits or words, incl. "sawa 2", "sadhe 3", "ek sau"). */
function readNumber(toks: string[], i: number): { value: number; len: number; weak: boolean } | null {
  const t = toks[i];
  const digit = parseNumberToken(t);
  if (digit !== null) return { value: digit, len: 1, weak: false };
  if ((t === "sawa" || t === "sadhe") && i + 1 < toks.length) {
    const next = readNumber(toks, i + 1);
    if (next) return { value: next.value + (t === "sawa" ? 0.25 : 0.5), len: next.len + 1, weak: false };
  }
  if (t in NUMBER_WORDS) {
    let value = NUMBER_WORDS[t];
    let len = 1;
    if (toks[i + 1] === "sau" && t !== "sau") {
      value *= 100;
      len = 2;
    }
    return { value, len, weak: WEAK_NUMBER_WORDS.has(t) && len === 1 };
  }
  return null;
}

function matchCue(toks: string[], i: number): { kind: CueKind; len: number } | null {
  for (const cue of CUES) {
    const n = cue.words.length;
    if (i + n > toks.length) continue;
    let ok = true;
    for (let k = 0; k < n; k++) {
      if (toks[i + k] !== cue.words[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return { kind: cue.kind, len: n };
  }
  return null;
}

function matchPhrase(idx: ProductIndex, toks: string[], i: number): { entry: IndexEntry; len: number; text: string } | null {
  for (let n = Math.min(idx.maxLen, toks.length - i); n >= 1; n--) {
    const text = toks.slice(i, i + n).join(" ");
    const entry = idx.phrases.get(text);
    if (entry) return { entry, len: n, text };
  }
  const t = toks[i];
  if (t.length >= 6) {
    const near = idx.fuzzy.find((k) => editDistanceAtMostOne(k, t));
    if (near) return { entry: idx.phrases.get(near)!, len: 1, text: t };
  }
  return null;
}

type Raw =
  | { k: "phrase"; entry: IndexEntry; text: string }
  | { k: "qty"; qty: Qty }
  | { k: "price"; value: number }
  | { k: "cue"; cue: CueKind; text: string }
  | { k: "word"; w: string }
  | { k: "punct"; p: string };

/** Classify tokens left to right. Order of precedence: price, number+unit, cue, product phrase, unit, number. */
function classify(toks: string[], catalogue: Catalogue): Raw[] {
  const idx = productIndex(catalogue);
  const out: Raw[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (PUNCT.test(t) && t.length === 1) {
      out.push({ k: "punct", p: t });
      i++;
      continue;
    }
    if (PRICE_BEFORE.has(t)) {
      const n = i + 1 < toks.length ? readNumber(toks, i + 1) : null;
      if (n) {
        out.push({ k: "price", value: n.value });
        i += 1 + n.len;
        continue;
      }
    }
    const num = readNumber(toks, i);
    if (num) {
      const after = toks[i + num.len];
      if (after && PRICE_AFTER.has(after)) {
        out.push({ k: "price", value: num.value });
        i += num.len + 1;
        continue;
      }
      // "62 ka kilo", "105 ka" -> price
      if (after === "ka" && !num.weak) {
        out.push({ k: "price", value: num.value });
        i += num.len + 1;
        continue;
      }
      const unit = after ? UNIT_WORDS[after] : undefined;
      if (unit) {
        out.push({ k: "qty", qty: { value: num.value, unit } });
        i += num.len + 1;
        continue;
      }
      if (!num.weak) {
        out.push({ k: "qty", qty: { value: num.value } });
        i += num.len;
        continue;
      }
    }
    // "pack kar do" is a command, not a unit
    const cue = matchCue(toks, i);
    if (cue) {
      out.push({ k: "cue", cue: cue.kind, text: toks.slice(i, i + cue.len).join(" ") });
      i += cue.len;
      continue;
    }
    const phrase = matchPhrase(idx, toks, i);
    if (phrase) {
      out.push({ k: "phrase", entry: phrase.entry, text: phrase.text });
      i += phrase.len;
      continue;
    }
    out.push({ k: "word", w: t });
    i++;
  }
  return out;
}

function refFromPhrases(parts: Array<{ entry: IndexEntry; text: string }>, ids: Set<string>, catalogue: Catalogue): ItemRef {
  const idx = productIndex(catalogue);
  const skuIds = catalogue.skus.filter((s) => ids.has(s.id)).map((s) => s.id);
  const cats = new Set(skuIds.map((id) => idx.categoryOf.get(id)));
  return {
    label: parts.map((p) => p.text).join(" "),
    skuIds,
    categoryOnly: parts.every((p) => p.entry.category) || undefined,
    category: cats.size === 1 ? [...cats][0] : undefined,
  };
}

/** Merge adjacent product phrases ("tata" + "namak") into mentions by intersecting their SKU sets. */
function groupMentions(raws: Raw[], catalogue: Catalogue): Array<Element | { k: "punct"; p: string }> {
  const out: Array<Element | { k: "punct"; p: string }> = [];
  let parts: Array<{ entry: IndexEntry; text: string }> = [];
  let ids: Set<string> | null = null;
  let pendingJoiners: Raw[] = [];

  const flush = () => {
    if (parts.length && ids) out.push({ k: "mention", ref: refFromPhrases(parts, ids, catalogue) });
    parts = [];
    ids = null;
  };

  for (const r of raws) {
    if (r.k === "phrase") {
      const next: Set<string> | null = ids ? new Set([...(ids as Set<string>)].filter((id) => r.entry.skuIds.has(id))) : new Set(r.entry.skuIds);
      if (ids && next && next.size === 0) {
        flush();
        out.push(...(pendingJoiners as Element[]));
        ids = new Set(r.entry.skuIds);
      } else {
        ids = next;
      }
      pendingJoiners = [];
      parts.push({ entry: r.entry, text: r.text });
      continue;
    }
    if (parts.length && r.k === "word" && JOINERS.has(r.w)) {
      pendingJoiners.push(r);
      continue;
    }
    flush();
    out.push(...(pendingJoiners as Element[]));
    pendingJoiners = [];
    out.push(r as Element | { k: "punct"; p: string });
  }
  flush();
  out.push(...(pendingJoiners as Element[]));
  return out;
}

/** Split an utterance into clauses at punctuation and discourse boundaries ("aur", "actually"). */
export function parseUtterance(text: string, catalogue: Catalogue): Clause[] {
  const grouped = groupMentions(classify(tokenize(text), catalogue), catalogue);
  const clauses: Clause[] = [];
  let cur: Element[] = [];
  const close = (question: boolean) => {
    if (cur.length) clauses.push({ els: cur, question });
    else if (question && clauses.length) clauses[clauses.length - 1].question = true;
    cur = [];
  };
  for (const el of grouped) {
    if (el.k === "punct") {
      close(el.p === "?");
      continue;
    }
    if (el.k === "cue" && el.cue === "boundary") {
      close(false);
      continue;
    }
    cur.push(el);
  }
  close(false);
  return clauses;
}

export function unitOf(qty: Qty | undefined): Unit | undefined {
  return qty?.unit;
}
