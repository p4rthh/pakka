import type { Speaker } from "../engine/types";
import { envSet } from "../engine/llm";

// Telephony adapter interface: STUBBED, NOT WIRED.
//
// Third-party apps cannot hear ordinary phone calls, so real capture works by
// forwarding the shop's number to a cloud telephony number (Exotel, Twilio,
// Bolna...). The provider bridges the call to the shop's phone and posts call
// events and live transcripts to a webhook. Each provider gets an adapter that
// turns its webhook shape into a CallEvent; the server then feeds `transcript`
// events into the same engine session the browser mic uses.
//
// See docs/TELEPHONY.md for the full path and what is needed to wire it.

export type CallEventKind = "call-started" | "transcript" | "call-ended";

export interface CallEvent {
  provider: string;
  callId: string;
  kind: CallEventKind;
  /** Caller (the buyer) and the called shop number, E.164 where available. */
  from?: string;
  to?: string;
  speaker?: Speaker;
  text?: string;
  confidence?: number;
}

export interface TelephonyAdapter {
  readonly provider: string;
  /** Env vars needed before this adapter can be wired (shown as "key not set"). */
  readonly requiredEnv: string[];
  /** Parse a webhook body (form fields or JSON) into a call event, or null if it is not one we use. */
  parseWebhook(body: Record<string, unknown>): CallEvent | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? undefined : String(v));

/**
 * Twilio: the call is forwarded to a Twilio number whose TwiML <Dial>s the shop
 * and starts real-time transcription (<Start><Transcription>). Twilio posts
 * form-encoded callbacks with CallSid, From, To, and for transcripts
 * TranscriptionEvent=transcription-content, Track (inbound_track = caller,
 * outbound_track = shop) and TranscriptionData = {"transcript","confidence"}.
 */
export const twilioAdapter: TelephonyAdapter = {
  provider: "twilio",
  requiredEnv: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  parseWebhook(body) {
    const callId = str(body.CallSid);
    if (!callId) return null;
    const base = { provider: "twilio", callId, from: str(body.From), to: str(body.To) };
    const event = str(body.TranscriptionEvent);
    if (event === "transcription-content") {
      // Only complete phrases go to the engine; partial (Final=false) results would double-count.
      if (str(body.Final) === "false") return null;
      let data: unknown;
      try {
        data = JSON.parse(str(body.TranscriptionData) ?? "{}");
      } catch {
        return null;
      }
      if (!data || typeof data !== "object") return null;
      const { transcript, confidence } = data as { transcript?: unknown; confidence?: unknown };
      if (typeof transcript !== "string" || !transcript.trim()) return null;
      return {
        ...base,
        kind: "transcript",
        speaker: str(body.Track) === "outbound_track" ? "seller" : "buyer",
        text: transcript,
        confidence: typeof confidence === "number" ? confidence : undefined,
      };
    }
    const status = str(body.CallStatus);
    if (status === "completed" || event === "transcription-stopped") return { ...base, kind: "call-ended" };
    if (status === "ringing" || status === "in-progress") return { ...base, kind: "call-started" };
    return null;
  },
};

/**
 * Exotel: an ExoPhone with call forwarding; a Passthru applet posts call
 * details (CallSid, CallFrom, CallTo, Status) and a Voicebot/stream applet
 * carries audio to a speech-to-text service. We assume that service posts
 * JSON {CallSid, leg: "caller"|"agent", text, confidence} back to us.
 */
export const exotelAdapter: TelephonyAdapter = {
  provider: "exotel",
  requiredEnv: ["EXOTEL_SID", "EXOTEL_API_KEY", "EXOTEL_API_TOKEN"],
  parseWebhook(body) {
    const callId = str(body.CallSid);
    if (!callId) return null;
    const base = { provider: "exotel", callId, from: str(body.CallFrom), to: str(body.CallTo) };
    const text = str(body.text);
    if (text) {
      const conf = Number(body.confidence);
      return { ...base, kind: "transcript", speaker: str(body.leg) === "agent" ? "seller" : "buyer", text, confidence: Number.isFinite(conf) ? conf : undefined };
    }
    const status = str(body.Status)?.toLowerCase();
    if (status === "completed" || status === "busy" || status === "no-answer" || status === "failed") return { ...base, kind: "call-ended" };
    return { ...base, kind: "call-started" };
  },
};

export const adapters: Record<string, TelephonyAdapter> = {
  twilio: twilioAdapter,
  exotel: exotelAdapter,
};

export function missingEnv(adapter: TelephonyAdapter, env: Record<string, string | undefined>): string[] {
  return adapter.requiredEnv.filter((k) => !envSet(env[k]));
}
