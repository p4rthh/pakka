// Thin wrapper over the browser Web Speech API (Chrome/Edge: webkitSpeechRecognition).
// Final results are handed to `onFinal`; interim text to `onInterim`.

export interface SpeechHandle {
  stop(): void;
}

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
}

interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return ctor() !== null;
}

export function startSpeech(opts: {
  lang: string;
  onFinal: (text: string, confidence: number | undefined) => void;
  onInterim: (text: string) => void;
  onError: (message: string) => void;
  /** Recognition stopped for good (permission denied, no microphone). */
  onStopped: () => void;
}): SpeechHandle | null {
  const Ctor = ctor();
  if (!Ctor) return null;
  let active = true;
  const rec = new Ctor();
  rec.lang = opts.lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        // Chrome reports 0 when it has no confidence estimate; treat that as unknown.
        const c = r[0].confidence;
        opts.onFinal(r[0].transcript, c > 0 ? c : undefined);
      } else interim += r[0].transcript;
    }
    opts.onInterim(interim);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
      active = false;
      opts.onError(e.error === "audio-capture" ? "No microphone found" : "Microphone permission denied");
      opts.onStopped();
    } else if (e.error !== "no-speech" && e.error !== "aborted") opts.onError(`Speech error: ${e.error}`);
  };
  // Chrome ends recognition after a pause; keep listening until stopped.
  rec.onend = () => {
    if (active) {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    }
  };
  rec.start();
  return {
    stop() {
      active = false;
      rec.stop();
    },
  };
}
