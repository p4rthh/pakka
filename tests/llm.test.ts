import { describe, expect, it } from "vitest";
import { catalogue } from "../src/data/catalogue";
import {
  anthropicClient,
  createConversation,
  geminiClient,
  llmExtractor,
  parseLlmActions,
  processUtterance,
  resolveLlmConfig,
  type LlmClient,
} from "../src/engine";

const fake = (reply: string | Error): LlmClient => ({
  name: "fake",
  async complete() {
    if (reply instanceof Error) throw reply;
    return reply;
  },
});

describe("resolveLlmConfig", () => {
  it("reports 'key not set' with no keys", () => {
    const cfg = resolveLlmConfig({});
    expect(cfg.provider).toBeNull();
    expect(cfg.message).toMatch(/key not set/);
  });
  it("prefers Anthropic, falls back to Gemini, honours model overrides", () => {
    expect(resolveLlmConfig({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" }).provider).toBe("anthropic");
    expect(resolveLlmConfig({ GEMINI_API_KEY: "g", GEMINI_MODEL: "gemini-x" })).toMatchObject({ provider: "gemini", model: "gemini-x" });
  });
  it("a forced provider without its key says which key is missing", () => {
    expect(resolveLlmConfig({ PAKKA_LLM_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a" }).message).toMatch(/GEMINI_API_KEY key not set/);
    expect(resolveLlmConfig({ PAKKA_LLM_PROVIDER: "rules", ANTHROPIC_API_KEY: "a" }).provider).toBeNull();
  });
  it("treats blank keys and .env.example placeholders as unset", () => {
    expect(resolveLlmConfig({ ANTHROPIC_API_KEY: "  " }).provider).toBeNull();
    expect(resolveLlmConfig({ ANTHROPIC_API_KEY: "your-anthropic-api-key" }).provider).toBeNull();
  });
});

describe("parseLlmActions", () => {
  it("keeps valid actions, drops unknown SKU ids and junk", () => {
    const raw = `Sure! {"actions":[
      {"type":"confirm","ref":{"label":"kolam","skuIds":["rice-kolam","made-up"]},"qty":{"value":"5","unit":"kg"}},
      {"type":"reject","ref":{"label":"x","skuIds":["nope"]},"reason":"price"},
      {"type":"teleport"},
      {"type":"set_qty","ref":{"label":"lux","skuIds":["soap-lux"]},"qty":{"value":-1}},
      {"type":"agree"}
    ]}`;
    expect(parseLlmActions(raw, catalogue)).toEqual([
      { type: "confirm", ref: { label: "kolam", skuIds: ["rice-kolam"], categoryOnly: undefined, category: "rice" }, qty: { value: 5, unit: "kg" } },
      { type: "agree" },
    ]);
  });
  it("throws on an unsupported unit or when every action is invalid, so the session falls back", () => {
    expect(() => parseLlmActions(`{"actions":[{"type":"confirm","ref":{"label":"x","skuIds":["rice-kolam"]},"qty":{"value":2,"unit":"tonne"}}]}`, catalogue)).toThrow(/unit/);
    expect(() => parseLlmActions(`{"actions":[{"type":"confirm","ref":{"label":"x","skuIds":["nope"]}}]}`, catalogue)).toThrow(/validation/);
    expect(parseLlmActions(`{"actions":[]}`, catalogue)).toEqual([]);
  });
  it("throws when there is no JSON", () => {
    expect(() => parseLlmActions("I could not understand", catalogue)).toThrow();
  });
});

describe("llmExtractor", () => {
  it("drives the engine with model output", async () => {
    const ex = llmExtractor(fake(`{"actions":[{"type":"confirm","ref":{"label":"Fortune","skuIds":["oil-fortune-sunflower"]},"qty":{"value":2,"unit":"litre"}}]}`));
    const r = await processUtterance(createConversation("household"), { speaker: "buyer", text: "Fortune do litre" }, { catalogue, extractor: ex });
    expect(r.line.extractor).toBe("fake");
    expect(r.state.candidates[0]).toMatchObject({ skuId: "oil-fortune-sunflower", state: "confirmed", qty: { value: 2, unit: "litre" } });
  });

  it("never lets a seller line confirm items", async () => {
    const ex = llmExtractor(fake(`{"actions":[{"type":"confirm","ref":{"label":"Lux","skuIds":["soap-lux"]},"qty":{"value":2}},{"type":"readback"}]}`));
    const r = await processUtterance(createConversation("household"), { speaker: "seller", text: "Toh final: Lux 2" }, { catalogue, extractor: ex });
    expect(r.state.candidates).toHaveLength(0);
    expect(r.state.phase).toBe("readback");
  });

  it("falls back to the rule-based extractor when the model call fails", async () => {
    const ex = llmExtractor(fake(new Error("HTTP 529")));
    const r = await processUtterance(createConversation("household"), { speaker: "buyer", text: "Kolam 5 kilo de do" }, { catalogue, extractor: ex });
    expect(r.line.extractor).toBe("rules");
    expect(r.state.warnings[0]).toMatch(/HTTP 529/);
    expect(r.state.candidates[0]).toMatchObject({ skuId: "rice-kolam", state: "confirmed" });
  });
});

describe("HTTP clients", () => {
  it("anthropic client sends the Messages API shape", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchStub = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ content: [{ type: "text", text: '{"actions":[]}' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await anthropicClient("k", "claude-haiku-5-5", fetchStub).complete("sys", "usr");
    expect(out).toBe('{"actions":[]}');
    expect(seen!.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("k");
    expect(JSON.parse(seen!.init.body as string)).toMatchObject({ model: "claude-haiku-5-5", system: "sys" });
  });

  it("gemini client surfaces HTTP errors", async () => {
    const fetchStub = (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch;
    await expect(geminiClient("k", "gemini-3.5-flash-lite", fetchStub).complete("s", "u")).rejects.toThrow(/429/);
  });
});
