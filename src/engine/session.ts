import type { Action, Catalogue, ConversationState, TranscriptLine, Utterance } from "./types";
import { extractRules } from "./rules";
import { reduce } from "./reducer";

/** Anything that turns one utterance (in context) into engine actions. */
export interface Extractor {
  readonly name: string;
  extract(input: ExtractInput): Promise<Action[]>;
}

export interface ExtractInput {
  utterance: Utterance;
  /** Transcript index this utterance will get. */
  index: number;
  state: ConversationState;
  catalogue: Catalogue;
}

export const rulesExtractor: Extractor = {
  name: "rules",
  async extract({ utterance, state, catalogue }) {
    return extractRules(utterance, state, catalogue);
  },
};

/** Below this speech confidence a line is shown but not acted on. */
export const IGNORE_BELOW = 0.45;
/** Below this, actions apply but touched items are flagged for the shopkeeper to check. */
export const REVIEW_BELOW = 0.7;

export interface ProcessOptions {
  catalogue: Catalogue;
  extractor?: Extractor;
  /** Used when the primary extractor throws (e.g. LLM network error). */
  fallback?: Extractor;
}

export interface ProcessResult {
  state: ConversationState;
  line: TranscriptLine;
}

/** Process one utterance: extract actions, apply them, append the transcript line. */
export async function processUtterance(
  state: ConversationState,
  utterance: Utterance,
  opts: ProcessOptions,
): Promise<ProcessResult> {
  const index = state.transcript.length;
  const text = utterance.text.trim();
  const confidence = utterance.confidence;
  const base: TranscriptLine = { ...utterance, text, index, actions: [], extractor: "none" };

  if (!text) return { state, line: base };

  if (confidence !== undefined && confidence < IGNORE_BELOW) {
    const line: TranscriptLine = { ...base, ignored: true, lowConfidence: true };
    const next = structuredClone(state);
    next.transcript.push(line);
    next.warnings.push(`Line ${index + 1} heard unclearly (${Math.round(confidence * 100)}%), not used: "${text}"`);
    return { state: next, line };
  }

  const extractor = opts.extractor ?? rulesExtractor;
  let actions: Action[];
  let used = extractor.name;
  let warning: string | undefined;
  try {
    actions = await extractor.extract({ utterance: { ...utterance, text }, index, state, catalogue: opts.catalogue });
  } catch (err) {
    const fb = opts.fallback ?? rulesExtractor;
    actions = await fb.extract({ utterance: { ...utterance, text }, index, state, catalogue: opts.catalogue });
    used = fb.name;
    warning = `${extractor.name} failed on line ${index + 1} (${(err as Error).message}); used ${fb.name}`;
  }

  const review = confidence !== undefined && confidence < REVIEW_BELOW;
  const line: TranscriptLine = { ...base, actions, extractor: used, lowConfidence: review || undefined };
  const withLine = structuredClone(state);
  withLine.transcript.push(line);
  if (warning) withLine.warnings.push(warning);
  if (review) withLine.warnings.push(`Line ${index + 1} heard with low confidence (${Math.round(confidence! * 100)}%): please check`);
  const next = reduce(withLine, actions, { catalogue: opts.catalogue, index, review });
  return { state: next, line };
}

/** Run a whole transcript through the engine (used by tests, the stateless API and demo replays). */
export async function processTranscript(
  state: ConversationState,
  utterances: Utterance[],
  opts: ProcessOptions,
): Promise<ConversationState> {
  let s = state;
  for (const u of utterances) s = (await processUtterance(s, u, opts)).state;
  return s;
}
