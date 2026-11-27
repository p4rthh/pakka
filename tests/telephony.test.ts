import { describe, expect, it } from "vitest";
import { exotelAdapter, missingEnv, twilioAdapter } from "../src/telephony/adapter";

describe("telephony adapters (stubs)", () => {
  it("twilio: real-time transcription callback becomes a transcript event with speaker by track", () => {
    const base = { CallSid: "CA1", From: "+919820012345", To: "+912224440000", TranscriptionEvent: "transcription-content" };
    expect(twilioAdapter.parseWebhook({ ...base, Track: "inbound_track", TranscriptionData: '{"transcript":"Kolam 5 kilo","confidence":0.92}' })).toEqual({
      provider: "twilio", callId: "CA1", from: "+919820012345", to: "+912224440000", kind: "transcript", speaker: "buyer", text: "Kolam 5 kilo", confidence: 0.92,
    });
    expect(twilioAdapter.parseWebhook({ ...base, Track: "outbound_track", TranscriptionData: '{"transcript":"Toh final"}' })?.speaker).toBe("seller");
    expect(twilioAdapter.parseWebhook({ ...base, TranscriptionData: "not json" })).toBeNull();
    expect(twilioAdapter.parseWebhook({ ...base, TranscriptionData: "null" })).toBeNull();
    expect(twilioAdapter.parseWebhook({ ...base, Final: "false", TranscriptionData: '{"transcript":"Kol"}' })).toBeNull();
  });

  it("twilio: call status callbacks", () => {
    expect(twilioAdapter.parseWebhook({ CallSid: "CA1", CallStatus: "ringing" })?.kind).toBe("call-started");
    expect(twilioAdapter.parseWebhook({ CallSid: "CA1", CallStatus: "completed" })?.kind).toBe("call-ended");
    expect(twilioAdapter.parseWebhook({ From: "x" })).toBeNull();
  });

  it("exotel: passthru and transcript shapes", () => {
    expect(exotelAdapter.parseWebhook({ CallSid: "e1", CallFrom: "09820012345", CallTo: "02224440000", Status: "completed" })?.kind).toBe("call-ended");
    expect(exotelAdapter.parseWebhook({ CallSid: "e1", leg: "agent", text: "Haan boliye", confidence: "0.8" })).toMatchObject({ kind: "transcript", speaker: "seller", confidence: 0.8 });
  });

  it("reports which keys are missing", () => {
    expect(missingEnv(twilioAdapter, {})).toEqual(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]);
    expect(missingEnv(twilioAdapter, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "your-twilio-auth-token" })).toEqual(["TWILIO_AUTH_TOKEN"]);
  });
});
