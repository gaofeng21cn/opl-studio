export type VoiceInputStatus = "idle" | "recording" | "transcribing" | "denied" | "unsupported" | "error";
export type VoiceInputState = { status: VoiceInputStatus; reason?: string };

export type VoiceInputContext = {
  threadId?: string;
  workspacePath: string;
  /** Pure context support only: Studio's Host Profile is fixed at startup.
   * Dynamic switching needs an owner-provided identity; fast/full is not one. */
  profileId?: string;
  locale: "zh" | "en";
  revision: number;
};

export function voiceInputContextKey(context: VoiceInputContext): string {
  return JSON.stringify([context.threadId ?? null, context.workspacePath, context.profileId ?? null, context.revision, context.locale]);
}

export function appendVoiceTranscript(draft: string, text: string, expected: VoiceInputContext, current: VoiceInputContext): string | undefined {
  if (voiceInputContextKey(expected) !== voiceInputContextKey(current) || !text.trim()) return undefined;
  return `${draft}${draft && !/\s$/.test(draft) ? " " : ""}${text.trim()}`;
}

export type VoiceRecognitionResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
export type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<VoiceRecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudioend?: (() => void) | null;
};
export type VoiceRecognitionProvider = new () => VoiceRecognition;

export function voiceRecognitionProvider(): VoiceRecognitionProvider | undefined {
  const scope = globalThis as unknown as {
    isSecureContext?: boolean;
    SpeechRecognition?: VoiceRecognitionProvider;
    webkitSpeechRecognition?: VoiceRecognitionProvider;
  };
  if (scope.isSecureContext === false) return undefined;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

function failureState(reason: string): VoiceInputState {
  if (["not-allowed", "service-not-allowed", "NotAllowedError", "SecurityError"].includes(reason)) {
    return { status: "denied", reason };
  }
  return { status: reason === "language-not-supported" ? "unsupported" : "error", reason };
}

/** Own one browser recognition operation; cancellation withdraws all late callbacks. */
export function createVoiceInputController({
  onState,
  getProvider = voiceRecognitionProvider,
  recordingTimeoutMs = 60_000,
  transcriptionTimeoutMs = 15_000
}: {
  onState(state: VoiceInputState): void;
  getProvider?: () => VoiceRecognitionProvider | undefined;
  recordingTimeoutMs?: number;
  transcriptionTimeoutMs?: number;
}) {
  let active: VoiceRecognition | undefined;
  let phase: VoiceInputStatus = "idle";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function publish(state: VoiceInputState) {
    phase = state.status;
    if (!disposed) onState(state);
  }

  function release() {
    clearTimeout(timer);
    timer = undefined;
    const recognition = active;
    active = undefined;
    if (!recognition) return;
    recognition.onresult = recognition.onerror = recognition.onend = recognition.onaudioend = null;
    try { recognition.abort(); } catch { /* An already-ended browser capture needs no further release. */ }
  }

  function fail(reason: string) {
    release();
    publish(failureState(reason));
  }

  function transcribing() {
    if (!active || phase === "transcribing") return;
    clearTimeout(timer);
    publish({ status: "transcribing" });
    timer = setTimeout(() => fail("timeout"), transcriptionTimeoutMs);
  }

  function stop() {
    if (!active || phase !== "recording") return;
    const recognition = active;
    transcribing();
    try { recognition.stop(); } catch { fail("stop-failed"); }
  }

  return {
    start(locale: "zh" | "en", onTranscript: (text: string) => void) {
      if (disposed || active) return;
      const Provider = getProvider();
      if (!Provider) { publish({ status: "unsupported" }); return; }
      try {
        const recognition = new Provider();
        active = recognition;
        recognition.lang = locale === "zh" ? "zh-CN" : "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
          if (active !== recognition || disposed) return;
          const text = Array.from(event.results)
            .filter((result) => result.isFinal !== false)
            .map((result) => result[0]?.transcript ?? "").join("").trim();
          if (!text) return;
          release();
          publish({ status: "idle" });
          // Keep the draft callback captured at start, never a later task's callback.
          onTranscript(text);
        };
        recognition.onerror = (event) => {
          if (active === recognition && !disposed) fail(event.error);
        };
        recognition.onend = () => {
          if (active === recognition && !disposed) fail("no-speech");
        };
        recognition.onaudioend = () => {
          if (active === recognition && !disposed) transcribing();
        };
        publish({ status: "recording" });
        timer = setTimeout(stop, recordingTimeoutMs);
        recognition.start();
      } catch (error) {
        fail(error instanceof Error ? error.name : "start-failed");
      }
    },
    stop,
    cancel() {
      release();
      publish({ status: getProvider() ? "idle" : "unsupported" });
    },
    dispose() {
      disposed = true;
      release();
    }
  };
}
