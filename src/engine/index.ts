// Public surface of the Pakka engine. Frontends, API routes and telephony
// adapters import from here only.
export * from "./types";
export { createConversation, reduce } from "./reducer";
export { processUtterance, processTranscript, rulesExtractor, IGNORE_BELOW, REVIEW_BELOW } from "./session";
export type { Extractor, ExtractInput, ProcessOptions, ProcessResult } from "./session";
export { extractRules } from "./rules";
export { parseUtterance, tokenize } from "./parse";
export { buildReadback, spokenQty } from "./readback";
export { buildBill, buildPackingSlip, confirmIssues, whatsappLink, whatsappText } from "./bill";
export { insightsFromCall, summarize } from "./insights";
export type { DailyInsights } from "./insights";
export { buildStockCard, nearestAlternative, rateFor, skuById, toBaseQty } from "./stock";
export {
  resolveLlmConfig,
  clientFromConfig,
  llmExtractor,
  parseLlmActions,
  anthropicClient,
  geminiClient,
  DEFAULT_MODELS,
} from "./llm";
export type { LlmClient, LlmConfig, LlmProvider } from "./llm";
