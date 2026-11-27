import type { Action, Catalogue, ConversationState, ItemRef, Qty, RejectReason, Utterance } from "./types";
import { parseUtterance, type Clause, type Element } from "./parse";
import { STOPWORDS, type CueKind } from "./lexicon";

// Deterministic rule-based extractor. Works with no API key and handles the
// seeded demo scripts exactly. It reads each clause of an utterance, finds the
// product mentions, and attaches the cues and quantities around each mention
// (Hindi is verb-final, so cues usually follow the product: "Kolam hi de do").

interface MentionInfo {
  ref: ItemRef;
  cues: Set<CueKind>;
  qty?: Qty;
  /** "Kolam 5 nahi": a quantity was said and immediately withdrawn. */
  qtyCancelled?: boolean;
}

/** Split a clause into per-mention scopes. Elements before the first mention belong to it. */
function scopes(clause: Clause): { mentions: MentionInfo[]; leftovers: string[] } {
  const els = clause.els;
  const mentionIdx = els.map((e, i) => (e.k === "mention" ? i : -1)).filter((i) => i >= 0);
  const mentions: MentionInfo[] = [];
  let carryQty: Qty | undefined;
  mentionIdx.forEach((mi, n) => {
    const end = n + 1 < mentionIdx.length ? mentionIdx[n + 1] : els.length;
    const pre = n === 0 ? els.slice(0, mi) : [];
    const post = els.slice(mi + 1, end);
    const ref = (els[mi] as Extract<Element, { k: "mention" }>).ref;
    const info: MentionInfo = { ref, cues: new Set() };
    if (carryQty) {
      info.qty = carryQty;
      carryQty = undefined;
    }
    const scan = (part: Element[], isPost: boolean) => {
      for (let i = 0; i < part.length; i++) {
        const e = part[i];
        if (e.k === "cue") {
          // "Kolam 5 nahi, 10 kilo": a negation right after a number cancels the number, not the item.
          const prev = part[i - 1];
          if ((e.cue === "neg") && prev && prev.k === "qty") {
            info.qty = undefined;
            info.qtyCancelled = true;
            continue;
          }
          info.cues.add(e.cue);
        } else if (e.k === "qty") {
          if (isPost && info.qty && n + 1 < mentionIdx.length && i === part.length - 1) {
            // English order "25 kilo kolam 10 packet tata namak": trailing qty belongs to the next item.
            carryQty = e.qty;
          } else {
            info.qty = e.qty;
          }
        }
      }
    };
    scan(pre, false);
    scan(post, true);
    mentions.push(info);
  });
  const leftovers = mentionIdx.length
    ? []
    : els.filter((e): e is Extract<Element, { k: "word" }> => e.k === "word").map((e) => e.w).filter((w) => !STOPWORDS.has(w) && !/^\d/.test(w));
  return { mentions, leftovers };
}

function clauseCues(clause: Clause): { cues: Set<CueKind>; qty?: Qty } {
  const cues = new Set<CueKind>();
  let qty: Qty | undefined;
  clause.els.forEach((e, i) => {
    if (e.k === "cue") {
      const prev = clause.els[i - 1];
      if (e.cue === "neg" && prev && prev.k === "qty") {
        qty = undefined;
        return;
      }
      cues.add(e.cue);
    } else if (e.k === "qty") qty = e.qty;
  });
  if (clause.question) cues.add("question");
  return { cues, qty };
}

function sameRef(a: ItemRef, b: ItemRef) {
  return a.skuIds.join() === b.skuIds.join();
}

export function extractRules(utt: Utterance, state: ConversationState, catalogue: Catalogue): Action[] {
  const clauses = parseUtterance(utt.text, catalogue);
  const actions: Action[] = [];

  if (utt.speaker === "seller") {
    const offered: string[] = [];
    let readback = false;
    for (const c of clauses) {
      for (const e of c.els) {
        if (e.k === "mention" && !e.ref.categoryOnly && e.ref.skuIds.length === 1) offered.push(e.ref.skuIds[0]);
        if (e.k === "cue" && e.cue === "readback") readback = true;
      }
    }
    if (readback) actions.push({ type: "readback" });
    else if (offered.length) actions.push({ type: "suggest", skuIds: offered });
    return actions;
  }

  let lastRef: ItemRef | null = null;
  let pending: ItemRef[] = []; // mentioned with no intent yet; a later "de do" confirms them
  let agreed = false;
  const inReadback = state.phase !== "ordering";

  const commitPending = () => {
    for (const ref of pending) actions.push({ type: "confirm", ref });
    pending = [];
  };

  for (const clause of clauses) {
    const { mentions, leftovers } = scopes(clause);

    if (!mentions.length) {
      const { cues, qty } = clauseCues(clause);
      const asked = cues.has("question");
      // Only an explicit "hai kya" / "milega" counts here; a bare "?" is often small talk ("kaise ho?").
      const askedExplicit = clause.els.some((e) => e.k === "cue" && e.cue === "question");
      if (leftovers.length && (qty || askedExplicit) && !cues.has("neg")) {
        // Something we do not stock: "Amul butter 2 bhi de do", "Maggi hai kya?"
        actions.push({ type: "unknown_product", label: leftovers.slice(0, 3).join(" "), qty, asked: asked && !cues.has("commit") });
        continue;
      }
      if (cues.has("done")) {
        agreed = true;
        actions.push({ type: "agree" });
        continue;
      }
      if (cues.has("neg") || cues.has("priceneg") || cues.has("swap")) {
        const reason: RejectReason = cues.has("priceneg") ? "price" : "changed-mind";
        if (lastRef) {
          actions.push({ type: "reject", ref: lastRef, reason });
          pending = pending.filter((p) => !sameRef(p, lastRef!));
        } else actions.push({ type: "reject_focus", reason });
        if (qty) actions.push({ type: "set_focus_qty", qty });
        continue;
      }
      const committing = cues.has("commit") || cues.has("accept") || cues.has("readback");
      if (committing || (qty && qty.unit)) {
        if (pending.length && committing && !qty) {
          commitPending();
          continue;
        }
        if (lastRef) {
          actions.push(qty ? { type: "set_qty", ref: lastRef, qty } : { type: "confirm", ref: lastRef });
          pending = pending.filter((p) => !sameRef(p, lastRef!));
        } else if ((inReadback || agreed) && !qty) {
          agreed = true;
          actions.push({ type: "agree" });
        } else if (qty) {
          actions.push({ type: "set_focus_qty", qty });
        } else {
          actions.push({ type: "accept_focus" });
        }
      }
      continue;
    }

    for (const m of mentions) {
      const { ref, cues, qty } = m;
      lastRef = ref;
      if (cues.has("question") || (clause.question && !cues.has("commit"))) {
        if (ref.categoryOnly || (ref.skuIds.length > 1 && !qty)) {
          actions.push({ type: "browse", category: ref.category ?? "", skuIds: ref.skuIds, label: ref.label });
        } else actions.push({ type: "ask", ref, qty });
        continue;
      }
      if (cues.has("swap")) {
        actions.push({ type: "reject", ref, reason: "swapped" });
        continue;
      }
      if (cues.has("neg") || cues.has("priceneg")) {
        actions.push({ type: "reject", ref, reason: cues.has("priceneg") ? "price" : "changed-mind" });
        continue;
      }
      if (cues.has("commit") || cues.has("accept") || qty) {
        actions.push({ type: "confirm", ref, qty });
        if (cues.has("commit")) commitPending();
        continue;
      }
      if (ref.categoryOnly) {
        actions.push({ type: "browse", category: ref.category ?? "", skuIds: ref.skuIds, label: ref.label });
        continue;
      }
      if (m.qtyCancelled) continue; // the correction that follows will carry the new quantity
      actions.push({ type: "ask", ref });
      pending.push(ref);
    }
  }
  return actions;
}
