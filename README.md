# Pakka

**Phone call in, pakka bill out.** A voice-first order desk for Indian shops, built for the *India Runs on Voice* hackathon (Scaler x Wispr Flow), small business track.

A buyer phones a shop: a kirana owner ordering from a wholesaler, or a household ordering from its local kirana. Pakka follows the call and turns it into a priced bill, a packing slip and a WhatsApp confirmation. Nobody opens an app, and voice is the only input.

Everything said on the call starts **kaccha**. Only what the buyer confirms becomes **pakka**:

- Each product mentioned becomes a candidate tagged **asked-about**, **rejected** or **confirmed**. Only confirmed items reach the bill. For example, "Basmati... actually nahi, Kolam hi de do" drops Basmati and adds Kolam.
- "Rice mein kya kya hai?" brings up a **stock card** listing every rice with brand, price per kilo and stock on hand. Out-of-stock items are greyed out and the nearest alternative is shown, so the shopkeeper can read it out.
- When the seller says "Toh final: ...", a **read-back** of the confirmed list is generated. The buyer can correct it by voice ("Kolam 5 nahi, 10 kilo kar do") and the read-back updates.
- **Nothing is billed until the shopkeeper taps Confirm.** Confirm then produces the bill, a packing slip sorted by rack, and a `wa.me` click-to-chat link carrying the WhatsApp summary (no WhatsApp API needed).
- Hesitation becomes data. Lines such as "asked for Daawat, chose Kolam on price" and "asked for India Gate, out of stock" feed a daily view of sales lost to missing stock, swaps, products asked for but not stocked, and brands people name.

> Status: Round 2 prototype. The core engine, API, demo mode and tests are complete. The frontend is deliberately minimal: it only shows what the engine is doing. The designed counter screen comes later.

## Run it

### Docker (one command)

```bash
docker compose up --build
```

Then open <http://localhost:3000>. No keys and no `.env` file are needed. The page shows "LLM key not set ... using rule-based extraction" and everything works offline.

### Node

```bash
npm install
npm run dev          # http://localhost:3000
```

Requires Node 20+ (Node 22 is used in Docker).

### Tests

```bash
npm test                         # engine unit tests (vitest)
npx playwright install chromium  # once
npx playwright test              # builds, starts on :3100, runs e2e/demo.spec.ts
```

## Using the prototype

The page has three input modes. All three feed the same engine.

| Mode | What it does | Needs |
| --- | --- | --- |
| **Demo script** | Replays one of three seeded calls with realistic timing. Add `?speed=4` to the URL to speed it up. | Nothing. Always uses the deterministic rule-based extractor. |
| **Live mic** | Uses the browser Web Speech API (`hi-IN`, `en-IN` or `mr-IN`) on the laptop mic. Both sides of a call are simulated by speaking: switch "Speaking now" between Buyer and Seller. | Chrome or Edge, and mic permission. Uses the LLM if a key is set, otherwise rules. |
| **Type a line** | Type what was said, as buyer or seller. | Nothing. |

The demo scripts (`src/data/scripts.ts`):

- **(a) Wholesaler, decided buyer.** Patil Provision orders from Shah Traders in bori and dabba ("Kolam 2 bori ... Fortune tel 2 dabba"). The call ends with a read-back and a Marathi "Haan barobar ... pathva do". The bill uses wholesale rates: ₹15,430.
- **(b) Household browses, rejects on price, corrects at read-back.** The buyer asks "rice mein kya kya hai?", rejects Daawat at ₹105 as too costly, takes Kolam 5 kilo plus salt and oil, then changes it to 10 kilo during the read-back. Bill: ₹813.
- **(c) Out-of-stock brand becomes a lost sale.** The buyer asks for India Gate (out of stock), declines the Daawat substitute, and asks for Amul butter (not stocked). They buy only atta. The insights view records a ₹750 lost sale and the not-stocked request.

Buyer type (household → kirana, or kirana → wholesaler) can be selected. It sets the shop name and whether retail or wholesale rates apply.

## Environment variables

All are optional. See `.env.example`, and copy it to `.env.local` for `npm run dev` or to `.env` for Docker.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables LLM extraction via the Anthropic Messages API. |
| `ANTHROPIC_MODEL` | Default `claude-haiku-5-5`. |
| `GEMINI_API_KEY` | Enables LLM extraction via Gemini; used if no Anthropic key is set. |
| `GEMINI_MODEL` | Default `gemini-3.5-flash-lite`. |
| `PAKKA_LLM_PROVIDER` | Forces a provider: `anthropic`, `gemini` or `rules` (`rules` never calls an LLM). |
| `TWILIO_*`, `EXOTEL_*` | For the telephony adapters. They are stubs, so these only change the "key not set" message. |

Without a key, or when an LLM call fails, each line falls back to the rule-based extractor and a warning is shown. Keys are read only on the server and never sent to the browser. `.env*` files are git-ignored, except `.env.example`.

## Architecture

```
src/engine/      pure TypeScript, no framework: the reusable core
  parse.ts         tokenizer (Devanagari -> Latin), numbers, units, product mentions
  lexicon.ts       Hinglish / Hindi / Marathi cue words, units, number words
  rules.ts         deterministic extractor: utterance -> actions
  llm.ts           LLM extractor (Anthropic / Gemini over fetch), prompt, output validation
  reducer.ts       actions -> conversation state (candidates, focus, corrections, phase)
  readback.ts, bill.ts, insights.ts, stock.ts
  session.ts       processUtterance(): extractor + reducer + low-confidence handling
src/data/        seeded catalogue (42 SKUs of a Mumbai kirana/wholesaler) and demo scripts
src/server/      in-memory session + insight store used by the API routes
src/app/api/     HTTP API (below)
src/telephony/   Exotel / Twilio webhook adapters (stubbed, documented)
src/ui/          the minimal console (replaceable as a whole) + Web Speech wrapper
```

Extractors share one small action vocabulary: `browse`, `ask`, `confirm`, `reject`, `set_qty`, `accept_focus`, `reject_focus`, `suggest`, `unknown_product`, `readback` and `agree`. The rule-based and LLM paths are therefore interchangeable, and the reducer, bill and insights code is shared. Seller lines can only offer products or start the read-back. They never confirm anything on the buyer's behalf.

The engine handles:

- browsing a category
- price rejections ("bahut mehenga hai")
- brand switches, including "X ki jagah Y", which carries the quantity over
- quantity corrections, during read-back too
- ambiguous references ("basmati" stays unresolved until the buyer names one)
- a missing quantity (Confirm is blocked) or a missing unit (the base unit is assumed and flagged)
- unknown products (recorded, not billed)
- low-confidence speech: below 45% the line is ignored; below 70% the item is flagged for review

### HTTP API

| Method and path | Body / query | Returns |
| --- | --- | --- |
| `GET /api/status` |  | LLM provider or "key not set"; telephony status |
| `GET /api/catalogue` | `?buyerType=` | SKUs with the applicable price |
| `GET /api/demo-scripts`, `GET /api/demo-scripts/:id` |  | Script list / full script |
| `POST /api/sessions` | `{buyerType, buyerName?, buyerPhone?, mode?: "auto" or "rules"}` | New call session |
| `GET /api/sessions/:id` |  | Session: transcript, candidates, stock card, read-back, issues |
| `POST /api/sessions/:id/utterances` | `{speaker: "buyer" or "seller", text, confidence?}` | Processed line plus session |
| `POST /api/sessions/:id/readback` |  | Session with the read-back text |
| `POST /api/sessions/:id/confirm` | `{force?}` | Bill, packing slip and WhatsApp link, or `409 {issues}` |
| `GET /api/insights` | `?date=YYYY-MM-DD` | Daily lost sales, swaps, not-stocked asks, brand asks |
| `POST /api/interpret` | `{buyerType, utterances[]}` | Stateless: final state and a draft bill for a whole transcript |
| `POST /api/telephony/:provider` | provider webhook | `501`: stub that parses the payload (see below) |

Sessions and insights are kept in memory and are cleared on restart. The insights view is seeded with a few earlier calls from "today" so it is not empty on first load.

## Real phone calls (telephony path)

Third-party apps cannot hear ordinary phone calls. Real capture works by forwarding the shop's number to a cloud telephony number (Exotel, Twilio or Bolna). That number bridges the call to the shop's phone and streams live transcripts to a webhook, which feeds the same engine session. The adapter interface and the Exotel and Twilio payload parsers are in `src/telephony/adapter.ts`. They are stubbed, not wired, because wiring them needs paid accounts. The steps are in [docs/TELEPHONY.md](docs/TELEPHONY.md).

## Asset licences

- No images, icons or fonts are bundled. The UI uses the system font stack: Noto Sans and Noto Sans Devanagari where they are installed (SIL Open Font License).
- Catalogue brand names are used only to describe stocked products. Prices are illustrative, not real quotes.
- Dependencies: Next.js (MIT), React (MIT), TypeScript (Apache-2.0), Vitest (MIT), Playwright (Apache-2.0).
