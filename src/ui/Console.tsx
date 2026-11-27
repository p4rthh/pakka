"use client";

// Minimal counter console: shows what the engine is doing so it can be demoed
// and tested. Deliberately plain; the designed frontend will replace this file
// wholesale and talk to the same /api endpoints.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bill, BuyerType, Candidate, ConfirmIssue, ConversationState, PackingSlip, Speaker, TranscriptLine } from "@/engine/types";
import type { DailyInsights } from "@/engine/insights";
import { speechSupported, startSpeech, type SpeechHandle } from "./speech";

interface SessionView {
  id: string;
  buyerName: string;
  buyerPhone: string;
  mode: "auto" | "rules";
  shopName: string;
  state: ConversationState;
  issues: ConfirmIssue[];
  result: { bill: Bill; packingSlip: PackingSlip; whatsapp: { text: string; url: string } } | null;
}

interface ScriptMeta {
  id: string;
  title: string;
  summary: string;
  buyerType: BuyerType;
  buyerName: string;
  buyerPhone: string;
}

interface ScriptFull extends ScriptMeta {
  lines: Array<{ speaker: Speaker; text: string; pauseMs: number }>;
}

interface Status {
  llm: { configured: boolean; message: string };
  telephony: Array<{ provider: string; message: string }>;
}

type InputMode = "demo" | "live" | "type";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  return { ok: res.ok, status: res.status, data: (await res.json()) as T };
}

function qtyLabel(c: Candidate): string {
  if (!c.qty) return "—";
  return `${c.qty.value}${c.qty.unit ? " " + c.qty.unit : ""}${c.unitAssumed ? " (unit assumed)" : ""}`;
}

function flags(c: Candidate, skuName: (id: string) => string): string[] {
  const f: string[] = [];
  if (c.reason) f.push(`reason: ${c.reason}`);
  if (c.unavailable) f.push("out of stock");
  if (c.unknown) f.push("not in catalogue");
  if (c.needs.includes("qty")) f.push("needs quantity");
  if (c.needs.includes("sku") && c.options) f.push(`which one? ${c.options.map(skuName).join(" / ")}`);
  if (c.needsReview) f.push("heard unclearly: check");
  return f;
}

export default function Console() {
  const [status, setStatus] = useState<Status | null>(null);
  const [scripts, setScripts] = useState<ScriptMeta[]>([]);
  const [scriptId, setScriptId] = useState("b");
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<InputMode>("demo");
  const [buyerType, setBuyerType] = useState<BuyerType>("household");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [session, setSession] = useState<SessionView | null>(null);
  const [demoState, setDemoState] = useState<"idle" | "playing" | "finished" | "stopped">("idle");
  const [interim, setInterim] = useState<{ speaker: Speaker; text: string } | null>(null);
  const [speaker, setSpeaker] = useState<Speaker>("buyer");
  const [lang, setLang] = useState("hi-IN");
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState("");
  const [issues, setIssues] = useState<ConfirmIssue[] | null>(null);
  const [insights, setInsights] = useState<DailyInsights | null>(null);
  const [skuNames, setSkuNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const runToken = useRef(0);
  const speech = useRef<SpeechHandle | null>(null);
  const sessionRef = useRef<SessionView | null>(null);
  const speakerRef = useRef<Speaker>("buyer");
  sessionRef.current = session;
  speakerRef.current = speaker;

  const loadInsights = useCallback(async () => {
    setInsights((await api<DailyInsights>("/api/insights")).data);
  }, []);

  useEffect(() => {
    const q = Number(new URLSearchParams(window.location.search).get("speed"));
    if (q > 0) setSpeed(q);
    void api<Status>("/api/status").then((r) => setStatus(r.data));
    void api<ScriptMeta[]>("/api/demo-scripts").then((r) => setScripts(r.data));
    void api<{ skus: Array<{ id: string; name: string }> }>("/api/catalogue").then((r) =>
      setSkuNames(Object.fromEntries(r.data.skus.map((s) => [s.id, s.name]))),
    );
    void loadInsights();
  }, [loadInsights]);

  const skuName = (id: string) => skuNames[id] ?? id;

  const newSession = useCallback(
    async (opts: { buyerType: BuyerType; buyerName: string; buyerPhone: string; mode: "auto" | "rules" }) => {
      const r = await api<SessionView>("/api/sessions", { method: "POST", body: JSON.stringify(opts) });
      setSession(r.data);
      setIssues(null);
      return r.data;
    },
    [],
  );

  const ensureSession = async () =>
    sessionRef.current && !sessionRef.current.result
      ? sessionRef.current
      : newSession({ buyerType, buyerName, buyerPhone, mode: "auto" });

  const send = useCallback(async (s: SessionView, sp: Speaker, text: string, confidence?: number) => {
    const r = await api<{ session: SessionView; error?: string }>(`/api/sessions/${s.id}/utterances`, {
      method: "POST",
      body: JSON.stringify({ speaker: sp, text, confidence }),
    });
    if (r.ok) setSession(r.data.session);
    else setMessage(r.data.error ?? `error ${r.status}`);
  }, []);

  const stopAll = () => {
    runToken.current++;
    speech.current?.stop();
    speech.current = null;
    setListening(false);
    setInterim(null);
    if (demoState === "playing") setDemoState("stopped");
  };

  const playDemo = async () => {
    stopAll();
    const token = ++runToken.current;
    const script = (await api<ScriptFull>(`/api/demo-scripts/${scriptId}`)).data;
    setBuyerType(script.buyerType);
    setBuyerName(script.buyerName);
    setBuyerPhone(script.buyerPhone);
    const s = await newSession({ buyerType: script.buyerType, buyerName: script.buyerName, buyerPhone: script.buyerPhone, mode: "rules" });
    setDemoState("playing");
    for (const line of script.lines) {
      await sleep(line.pauseMs / speed);
      // Stream the words in, like live captions, then hand the full line to the engine.
      const words = line.text.split(" ");
      for (let i = 1; i <= words.length; i++) {
        if (token !== runToken.current) return;
        setInterim({ speaker: line.speaker, text: words.slice(0, i).join(" ") });
        await sleep(110 / speed);
      }
      if (token !== runToken.current) return;
      setInterim(null);
      await send(s, line.speaker, line.text);
    }
    if (token === runToken.current) setDemoState("finished");
  };

  const toggleMic = async () => {
    if (listening) {
      speech.current?.stop();
      speech.current = null;
      setListening(false);
      setInterim(null);
      return;
    }
    const s = await ensureSession();
    const handle = startSpeech({
      lang,
      onFinal: (text, confidence) => {
        setInterim(null);
        if (text.trim()) void send(sessionRef.current ?? s, speakerRef.current, text, confidence);
      },
      onInterim: (text) => setInterim(text ? { speaker: speakerRef.current, text } : null),
      onError: (m) => setMessage(m),
    });
    if (!handle) {
      setMessage("This browser has no Web Speech API. Use Chrome or Edge, or type lines instead.");
      return;
    }
    speech.current = handle;
    setListening(true);
  };

  const sendTyped = async () => {
    if (!typed.trim()) return;
    const s = await ensureSession();
    await send(s, speaker, typed);
    setTyped("");
  };

  const readBack = async () => {
    if (!session) return;
    const r = await api<SessionView>(`/api/sessions/${session.id}/readback`, { method: "POST" });
    if (r.ok) setSession(r.data);
  };

  const confirm = async (force = false) => {
    if (!session) return;
    const r = await api<{ session?: SessionView; issues?: ConfirmIssue[] }>(`/api/sessions/${session.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ force }),
    });
    if (r.ok && r.data.session) {
      setSession(r.data.session);
      setIssues(null);
      void loadInsights();
    } else setIssues(r.data.issues ?? []);
  };

  const state = session?.state;
  const result = session?.result;
  const transcript: TranscriptLine[] = state?.transcript ?? [];

  return (
    <main>
      <header>
        <h1>Pakka</h1>
        <p className="muted">Phone call in, pakka bill out. Kaccha until the buyer confirms; nothing is billed until you tap Confirm.</p>
        <p data-testid="llm-status" className={status?.llm.configured ? "ok" : "warn"}>
          {status ? status.llm.message : "loading status…"}
        </p>
        {status && (
          <p className="muted small">Telephony: {status.telephony.map((t) => `${t.provider}: ${t.message}`).join(" · ")}</p>
        )}
      </header>

      <section className="panel">
        <h2>Call setup</h2>
        <div className="row">
          <label>
            Buyer type{" "}
            <select value={buyerType} onChange={(e) => setBuyerType(e.target.value as BuyerType)} data-testid="buyer-type">
              <option value="household">Household → kirana</option>
              <option value="wholesaler">Kirana → wholesaler</option>
            </select>
          </label>
          <label>
            Buyer <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="name" />
          </label>
          <label>
            Phone <input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="98xxxxxxxx" inputMode="tel" />
          </label>
          <button
            onClick={() => {
              stopAll();
              setDemoState("idle");
              void newSession({ buyerType, buyerName, buyerPhone, mode: "auto" });
            }}
          >
            New call
          </button>
        </div>
        <div className="row" role="tablist">
          {(["demo", "live", "type"] as InputMode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
              {m === "demo" ? "Demo script" : m === "live" ? "Live mic" : "Type a line"}
            </button>
          ))}
        </div>

        {mode === "demo" && (
          <div className="row">
            <select value={scriptId} onChange={(e) => setScriptId(e.target.value)} data-testid="script-select">
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  ({s.id}) {s.title} [{s.buyerType}]
                </option>
              ))}
            </select>
            <label>
              Speed{" "}
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                {[...new Set([0.5, 1, 2, 4, speed])].sort((a, b) => a - b).map((v) => (
                  <option key={v} value={v}>
                    {v}×
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => void playDemo()} data-testid="play-demo">
              Play
            </button>
            <button onClick={stopAll}>Stop</button>
            <span data-testid="demo-status" className="muted">
              {demoState}
            </span>
          </div>
        )}
        {mode === "demo" && <p className="muted small">{scripts.find((s) => s.id === scriptId)?.summary}</p>}

        {mode === "live" && (
          <div className="row">
            <label>
              Speaking now{" "}
              <select value={speaker} onChange={(e) => setSpeaker(e.target.value as Speaker)}>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller (you)</option>
              </select>
            </label>
            <label>
              Language{" "}
              <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={listening}>
                <option value="hi-IN">Hindi (hi-IN)</option>
                <option value="en-IN">English India (en-IN)</option>
                <option value="mr-IN">Marathi (mr-IN)</option>
              </select>
            </label>
            <button onClick={() => void toggleMic()} className={listening ? "active" : ""}>
              {listening ? "Stop mic" : "Start mic"}
            </button>
            {!speechSupported() && <span className="warn">Web Speech API not available in this browser.</span>}
          </div>
        )}
        {mode === "live" && <p className="muted small">Both sides of a call are simulated by speaking: switch “Speaking now” between buyer and seller.</p>}

        {mode === "type" && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void sendTyped();
            }}
          >
            <select value={speaker} onChange={(e) => setSpeaker(e.target.value as Speaker)} data-testid="type-speaker">
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
            </select>
            <input
              className="grow"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="e.g. Kolam 5 kilo aur Tata namak ek packet de do"
              data-testid="type-input"
            />
            <button type="submit">Send</button>
          </form>
        )}
        {message && (
          <p className="warn" onClick={() => setMessage(null)}>
            {message}
          </p>
        )}
      </section>

      <div className="grid">
        <section className="panel" data-testid="transcript">
          <h2>Transcript {session && <span className="muted small">· {session.shopName} · {session.mode === "rules" ? "rule-based" : "auto"} extraction</span>}</h2>
          {!transcript.length && !interim && <p className="muted">No call yet.</p>}
          <ol>
            {transcript.map((l) => (
              <li key={l.index} className={l.ignored ? "struck" : ""}>
                <b>{l.speaker}:</b> {l.text}
                {l.lowConfidence && <span className="warn small"> (low confidence{l.ignored ? ", ignored" : ""})</span>}
                {l.actions.length > 0 && <div className="muted small">→ {l.actions.map((a) => a.type).join(", ")} [{l.extractor}]</div>}
              </li>
            ))}
            {interim && (
              <li className="muted">
                <b>{interim.speaker}:</b> {interim.text}…
              </li>
            )}
          </ol>
          {state && state.warnings.length > 0 && (
            <ul className="warn small">
              {state.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" data-testid="order">
          <h2>Order (kaccha → pakka)</h2>
          {!state?.candidates.length && <p className="muted">Items appear here as they are mentioned.</p>}
          {!!state?.candidates.length && (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>State</th>
                  <th>Qty</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {state.candidates.map((c) => (
                  <tr key={c.id} data-testid={`candidate-${c.skuId ?? c.label}`} data-state={c.state} className={`state-${c.state}`}>
                    <td>
                      {c.label}
                      <div className="muted small">{c.skuId ? skuName(c.skuId) : c.unknown ? "unknown" : "ambiguous"}</div>
                    </td>
                    <td>{c.state === "asked" ? "asked-about" : c.state}</td>
                    <td>{qtyLabel(c)}</td>
                    <td className="small">
                      {flags(c, skuName).join("; ")}
                      <div className="muted">{c.history[c.history.length - 1]?.note}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" data-testid="stock-card">
          <h2>Stock card</h2>
          {!state?.stockCard && <p className="muted">Shows when the buyer asks “rice mein kya kya hai?” or names a product.</p>}
          {state?.stockCard && (
            <>
              <p>
                <b>{state.stockCard.title}</b>
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {state.stockCard.items.map((i) => (
                    <tr key={i.skuId} className={i.inStock ? "" : "oos"}>
                      <td>
                        {i.name} <span className="muted small">({i.brand}, {i.pack})</span>
                        {!i.inStock && i.alternativeId && <div className="small">Out of stock. Nearest: {skuName(i.alternativeId)}</div>}
                      </td>
                      <td>
                        {inr(i.pricePerUnit)}/{i.baseUnit}
                      </td>
                      <td>{i.inStock ? `${i.stock} ${i.baseUnit}` : "out of stock"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="panel" data-testid="readback">
          <h2>Read-back</h2>
          <p data-testid="readback-text">{state?.readback ?? <span className="muted">Say “toh final…” or press Read back.</span>}</p>
          <p className="muted small">Phase: {state?.phase ?? "—"}</p>
          <div className="row">
            <button onClick={() => void readBack()} disabled={!session || !!result}>
              Read back
            </button>
            <button onClick={() => void confirm(false)} disabled={!session || !!result} data-testid="confirm" className="primary">
              Confirm order
            </button>
          </div>
          {issues && issues.length > 0 && (
            <div className="warn" data-testid="issues">
              <p>Cannot bill yet:</p>
              <ul>
                {issues.map((i, n) => (
                  <li key={n}>
                    {i.label}: {i.problem}
                  </li>
                ))}
              </ul>
              {!issues.some((i) => i.problem === "nothing confirmed yet") && <button onClick={() => void confirm(true)}>Bill what is clear</button>}
            </div>
          )}
        </section>
      </div>

      {result && (
        <section className="panel" data-testid="bill">
          <h2>
            Bill {result.bill.id} · {result.bill.shopName}
          </h2>
          <p className="muted small">
            {result.bill.buyerName} {result.bill.buyerPhone} · {result.bill.buyerType} rates
          </p>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {result.bill.lines.map((l) => (
                <tr key={l.skuId} data-testid="bill-line">
                  <td>{l.name}</td>
                  <td>
                    {l.qty.value} {l.qty.unit}
                    {l.qty.unit !== l.baseUnit && <span className="muted small"> (= {l.baseQty} {l.baseUnit})</span>}
                    {l.shortBy && <span className="warn small"> short by {l.shortBy}</span>}
                  </td>
                  <td>
                    {inr(l.rate)}/{l.baseUnit}
                  </td>
                  <td data-testid="bill-amount">{inr(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {result.bill.roundOff !== 0 && (
                <tr>
                  <td colSpan={3}>Round off</td>
                  <td>{inr(result.bill.roundOff)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={3}>
                  <b>Total</b>
                </td>
                <td data-testid="bill-total">
                  <b>{inr(result.bill.total)}</b>
                </td>
              </tr>
            </tfoot>
          </table>
          {result.bill.notAvailable.length > 0 && <p className="small">Not on bill: {result.bill.notAvailable.join(", ")}</p>}

          <h3>Packing slip</h3>
          <table data-testid="packing-slip">
            <thead>
              <tr>
                <th>Rack</th>
                <th>Item</th>
                <th>Pack</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {result.packingSlip.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.rack}</td>
                  <td>{l.name}</td>
                  <td>{l.pack}</td>
                  <td>
                    {l.qty} {l.note && <span className="warn small">{l.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>WhatsApp confirmation</h3>
          <p>
            <a href={result.whatsapp.url} target="_blank" rel="noreferrer" data-testid="whatsapp-link">
              Open WhatsApp with this message
            </a>{" "}
            {!result.bill.buyerPhone && <span className="muted small">(no buyer phone: WhatsApp will ask for a contact)</span>}
          </p>
          <pre>{result.whatsapp.text}</pre>
        </section>
      )}

      <section className="panel" data-testid="insights">
        <h2>Today: sales lost and what buyers asked for</h2>
        {!insights && <p className="muted">Loading…</p>}
        {insights && (
          <>
            <p>
              Lost to missing stock: <b data-testid="lost-value">{inr(insights.lostSalesValue)}</b> <span className="muted small">({insights.events} events, includes seeded earlier calls)</span>
            </p>
            <div className="grid">
              <div>
                <h3>Lost sales</h3>
                <ul>
                  {insights.lostSales.map((r) => (
                    <li key={r.label}>
                      {r.label}: {r.asks}× asked, {inr(r.value)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Not stocked, asked for</h3>
                <ul>
                  {insights.notStocked.map((r) => (
                    <li key={r.label}>
                      {r.label}: {r.asks}×
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Swaps</h3>
                <ul>
                  {insights.swaps.map((r, i) => (
                    <li key={i}>
                      asked {r.from}, took {r.to} ({r.reason}){r.count > 1 ? ` ×${r.count}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Brands asked for</h3>
                <ul>
                  {insights.brandAsks.map((r) => (
                    <li key={r.brand}>
                      {r.brand}: {r.asks} asks, {r.bought} bought
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
