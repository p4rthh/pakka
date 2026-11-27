# Telephony path (stubbed, not wired)

Pakka's prototype takes speech from the laptop mic (Web Speech API), typed lines or a demo script. Real shop calls need a cloud telephony number, because no third-party app on the shopkeeper's phone can hear an ordinary call.

## How a real call would flow

```
Buyer dials the shop number
   │  (call forwarding on the shop's SIM: "forward all calls" to the cloud number)
   ▼
Cloud number (Exotel ExoPhone / Twilio number / Bolna agent number)
   │  bridges the call to the shopkeeper's phone, so the two people talk normally
   │  streams both legs to speech-to-text (Hindi / Hinglish / Marathi)
   ▼
POST /api/telephony/:provider        <- webhook, one per call event / transcript line
   │  adapter.parseWebhook(body) -> CallEvent {callId, kind, speaker, text, confidence}
   ▼
call-started  -> createSession({buyerPhone: from})        (map callId -> session id)
transcript    -> addUtterance(session, {speaker, text, confidence})
call-ended    -> leave the session open for the shopkeeper's Confirm tap
   ▼
Counter screen polls GET /api/sessions/:id (or SSE later) and shows the order live
```

The two legs map to speakers. The caller leg is the **buyer** and the shop leg is the **seller**. Two separate channels make speaker attribution reliable, which a single laptop mic cannot do.

## What exists now

- `src/telephony/adapter.ts`:
  - The `TelephonyAdapter` interface: `parseWebhook(body) -> CallEvent | null` plus `requiredEnv`.
  - `twilioAdapter` parses Twilio voice status callbacks (`CallSid`, `From`, `To`, `CallStatus`) and real-time transcription callbacks (`TranscriptionEvent=transcription-content`, `Track=inbound_track|outbound_track`, `TranscriptionData={"transcript","confidence"}`).
  - `exotelAdapter` parses Exotel Passthru applet fields (`CallSid`, `CallFrom`, `CallTo`, `Status`). It also parses an assumed JSON transcript post `{CallSid, leg: "caller"|"agent", text, confidence}` from whatever speech-to-text service sits behind Exotel's stream/Voicebot applet.
- `POST /api/telephony/:provider` parses the payload with the adapter and returns **501** with the parsed event and a "key not set" message. Nothing is forwarded into a session.
- `tests/telephony.test.ts` covers the payload shapes.

## To wire it (needs paid accounts)

1. Buy a number. Point its voice webhook at a TwiML/flow that `<Dial>`s the shop's real phone and starts real-time transcription (Twilio `<Start><Transcription>` with a Hindi-capable engine, or Exotel stream to an STT service).
2. Set `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` (or the `EXOTEL_*` vars) and verify webhook signatures (`X-Twilio-Signature`) before trusting a payload.
3. In the route, replace the 501 with: look up or create the session for `callId`, then call `addUtterance` for each `transcript` event.
4. Expose the app on a public HTTPS URL (the provider must reach the webhook).
5. On the shop's SIM, set unconditional call forwarding to the cloud number. Busy/no-answer forwarding also works if the shop wants a choice.

Cost and latency notes: per-minute telephony plus STT charges apply. Transcripts arrive per phrase, which suits the engine because it works line by line.
