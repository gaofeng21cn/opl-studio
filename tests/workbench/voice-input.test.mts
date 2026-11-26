import { describe, expect, test } from "bun:test";
import {
  appendVoiceTranscript,
  createVoiceInputController,
  voiceInputContextKey,
  voiceRecognitionProvider,
  type VoiceInputContext,
  type VoiceInputState,
  type VoiceRecognition,
  type VoiceRecognitionResult
} from "../../plugins/core/opl-studio-client/src/client/composition/voiceInputModel";

class Recognition implements VoiceRecognition {
  static instances: Recognition[] = [];
  lang = "";
  continuous = true;
  interimResults = true;
  starts = 0;
  stops = 0;
  aborts = 0;
  startError?: Error;
  stopError?: Error;
  onresult: VoiceRecognition["onresult"] = null;
  onerror: VoiceRecognition["onerror"] = null;
  onend: VoiceRecognition["onend"] = null;
  onaudioend: VoiceRecognition["onaudioend"] = null;
  constructor() { Recognition.instances.push(this); }
  start() { this.starts++; if (this.startError) throw this.startError; }
  stop() { this.stops++; if (this.stopError) throw this.stopError; }
  abort() { this.aborts++; }
}

function result(text: string, isFinal = true): VoiceRecognitionResult {
  return Object.assign([{ transcript: text }], { isFinal });
}

function setup(overrides: Partial<Parameters<typeof createVoiceInputController>[0]> = {}) {
  const states: VoiceInputState[] = [];
  const texts: string[] = [];
  const controller = createVoiceInputController({ getProvider: () => Recognition, onState: state => states.push(state), ...overrides });
  return {
    states, texts, controller,
    start(locale: "zh" | "en" = "zh") {
      controller.start(locale, text => texts.push(text));
      return Recognition.instances.at(-1)!;
    }
  };
}

describe("browser voice input lifecycle", () => {
  test("starts the existing browser provider with a single localized final-result capture", () => {
    const run = setup();
    const recognition = run.start();
    expect(recognition.lang).toBe("zh-CN");
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(false);
    expect(recognition.starts).toBe(1);
    expect(run.states).toEqual([{ status: "recording" }]);
    run.controller.dispose();
  });

  test("stop enters transcribing and delivers final text exactly once before releasing capture", () => {
    const run = setup();
    const recognition = run.start("en");
    const lateResult = recognition.onresult!;
    expect(recognition.lang).toBe("en-US");
    run.controller.stop();
    run.controller.stop();
    expect(recognition.stops).toBe(1);
    expect(run.states.at(-1)?.status).toBe("transcribing");
    lateResult({ results: [result("draft "), result("only"), result("interim", false)] });
    lateResult({ results: [result("duplicate")] });
    expect(run.texts).toEqual(["draft only"]);
    expect(run.states.at(-1)?.status).toBe("idle");
    expect(recognition.aborts).toBe(1);
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
    expect(recognition.onaudioend).toBeNull();
    run.controller.dispose();
  });

  test("native audio end also enters transcribing without starting another microphone", () => {
    const run = setup();
    const recognition = run.start();
    recognition.onaudioend?.();
    expect(run.states.at(-1)?.status).toBe("transcribing");
    expect(recognition.stops).toBe(0);
    recognition.onresult?.({ results: [result("text")] });
    expect(run.texts).toEqual(["text"]);
    run.controller.dispose();
  });

  test("interim and empty results are not inserted; end without final text reports no speech", () => {
    const run = setup();
    const recognition = run.start();
    recognition.onresult?.({ results: [result("interim", false), result("  ")] });
    expect(run.texts).toEqual([]);
    recognition.onend?.();
    expect(run.states.at(-1)).toEqual({ status: "error", reason: "no-speech" });
    expect(recognition.aborts).toBe(1);
    run.controller.dispose();
  });

  test("denied microphone and service permissions are distinct from network failures", () => {
    for (const reason of ["not-allowed", "service-not-allowed", "network", "audio-capture", "language-not-supported"]) {
      const run = setup();
      const recognition = run.start();
      recognition.onerror?.({ error: reason });
      expect(run.states.at(-1)).toEqual({
        status: reason.endsWith("not-allowed") ? "denied" : reason === "language-not-supported" ? "unsupported" : "error", reason
      });
      expect(run.texts).toEqual([]);
      expect(recognition.aborts).toBe(1);
      run.controller.dispose();
    }
  });

  test("permission errors thrown by start release the engine and permit an explicit retry", () => {
    class Denied extends Recognition {
      override start() { throw new DOMException("denied", "NotAllowedError"); }
    }
    let provider: typeof Recognition = Denied;
    const run = setup({ getProvider: () => provider });
    const denied = run.start();
    expect(run.states.at(-1)).toEqual({ status: "denied", reason: "NotAllowedError" });
    expect(denied.aborts).toBe(1);
    provider = Recognition;
    const retry = run.start();
    expect(retry.starts).toBe(1);
    retry.onresult?.({ results: [result("retry")] });
    expect(run.texts).toEqual(["retry"]);
    run.controller.dispose();
  });

  test("constructor failures are reported without pretending recording started", () => {
    class Broken extends Recognition {
      constructor() { super(); throw new Error("unavailable"); }
    }
    const run = setup({ getProvider: () => Broken });
    run.start();
    expect(run.states).toEqual([{ status: "error", reason: "Error" }]);
    expect(run.texts).toEqual([]);
    run.controller.dispose();
  });

  test("missing provider is unsupported and never opens a microphone", () => {
    const run = setup({ getProvider: () => undefined });
    const count = Recognition.instances.length;
    run.controller.start("zh", text => run.texts.push(text));
    expect(Recognition.instances.length).toBe(count);
    expect(run.states).toEqual([{ status: "unsupported" }]);
    run.controller.dispose();
  });

  test("double start does not create a second capture", () => {
    const run = setup();
    const recognition = run.start();
    run.controller.start("en", () => { throw new Error("must not replace draft owner"); });
    expect(Recognition.instances.at(-1)).toBe(recognition);
    recognition.onresult?.({ results: [result("original draft")] });
    expect(run.texts).toEqual(["original draft"]);
    run.controller.dispose();
  });

  test("cancel during recording or transcription aborts and rejects queued native callbacks", () => {
    for (const stop of [false, true]) {
      const run = setup();
      const recognition = run.start();
      const lateResult = recognition.onresult!;
      const lateError = recognition.onerror!;
      const lateEnd = recognition.onend!;
      if (stop) run.controller.stop();
      run.controller.cancel();
      const afterCancel = run.states.length;
      lateResult({ results: [result("stale")] });
      lateError({ error: "network" });
      lateEnd();
      expect(run.states.length).toBe(afterCancel);
      expect(run.states.at(-1)?.status).toBe("idle");
      expect(run.texts).toEqual([]);
      expect(recognition.aborts).toBe(1);
      run.controller.dispose();
    }
  });

  test("a cancelled operation cannot fill a subsequent task's input", () => {
    const run = setup();
    const old = run.start();
    const lateResult = old.onresult!;
    run.controller.cancel();
    const nextTexts: string[] = [];
    run.controller.start("en", text => nextTexts.push(text));
    const next = Recognition.instances.at(-1)!;
    lateResult({ results: [result("old task")] });
    expect(nextTexts).toEqual([]);
    expect(run.texts).toEqual([]);
    next.onresult?.({ results: [result("new task")] });
    expect(nextTexts).toEqual(["new task"]);
    run.controller.dispose();
  });

  test("unmount disposal aborts without state updates or late transcripts", () => {
    const run = setup();
    const recognition = run.start();
    const lateResult = recognition.onresult!;
    const lateError = recognition.onerror!;
    const count = run.states.length;
    run.controller.dispose();
    run.controller.start("zh", text => run.texts.push(text));
    lateResult({ results: [result("unmounted")] });
    lateError({ error: "not-allowed" });
    expect(recognition.aborts).toBe(1);
    expect(run.states.length).toBe(count);
    expect(run.texts).toEqual([]);
  });

  test("stop failures release capture instead of getting stuck in transcribing", () => {
    const run = setup();
    const recognition = run.start();
    recognition.stopError = new Error("stop failed");
    run.controller.stop();
    expect(run.states.at(-1)).toEqual({ status: "error", reason: "stop-failed" });
    expect(recognition.aborts).toBe(1);
    run.controller.dispose();
  });

  test("transcription timeout releases the microphone and ignores a late final result", async () => {
    const run = setup({ transcriptionTimeoutMs: 1 });
    const recognition = run.start();
    const lateResult = recognition.onresult!;
    run.controller.stop();
    await Bun.sleep(10);
    expect(run.states.at(-1)).toEqual({ status: "error", reason: "timeout" });
    expect(recognition.aborts).toBe(1);
    lateResult({ results: [result("late")] });
    expect(run.texts).toEqual([]);
    run.controller.dispose();
  });

  test("capture duration is bounded and automatically moves to final transcription", async () => {
    const run = setup({ recordingTimeoutMs: 1 });
    const recognition = run.start();
    await Bun.sleep(10);
    expect(recognition.stops).toBe(1);
    expect(run.states.at(-1)?.status).toBe("transcribing");
    run.controller.dispose();
  });

  test("provider detection reuses standard or prefixed browser APIs only in a secure context", () => {
    const keys = ["SpeechRecognition", "webkitSpeechRecognition", "isSecureContext"] as const;
    const saved = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    try {
      Object.defineProperty(globalThis, "isSecureContext", { value: true, configurable: true });
      Object.defineProperty(globalThis, "SpeechRecognition", { value: Recognition, configurable: true });
      Object.defineProperty(globalThis, "webkitSpeechRecognition", { value: class extends Recognition {}, configurable: true });
      expect(voiceRecognitionProvider()).toBe(Recognition);
      Object.defineProperty(globalThis, "SpeechRecognition", { value: undefined, configurable: true });
      expect(voiceRecognitionProvider()).toBe((globalThis as any).webkitSpeechRecognition);
      Object.defineProperty(globalThis, "isSecureContext", { value: false, configurable: true });
      expect(voiceRecognitionProvider()).toBeUndefined();
    } finally {
      keys.forEach((key, index) => {
        if (saved[index]) Object.defineProperty(globalThis, key, saved[index]!);
        else Reflect.deleteProperty(globalThis, key);
      });
    }
  });
});

describe("voice draft context binding", () => {
  const context: VoiceInputContext = { threadId: "thread-a", workspacePath: "/workspace/a", profileId: "user-a", locale: "zh", revision: 1 };

  test("transcript appends to the latest manually edited draft, never a captured draft snapshot", () => {
    let draft = "before recording";
    const run = setup();
    run.controller.start("zh", text => {
      draft = appendVoiceTranscript(draft, text, context, context) ?? draft;
    });
    const recognition = Recognition.instances.at(-1)!;
    draft = "manually edited\n";
    recognition.onresult?.({ results: [result("transcript")] });
    expect(draft).toBe("manually edited\ntranscript");
    expect(appendVoiceTranscript("", " transcript ", context, context)).toBe("transcript");
    expect(appendVoiceTranscript("draft", "transcript", context, context)).toBe("draft transcript");
    run.controller.dispose();
  });

  test("thread, workspace, user Profile, locale, and new-task transitions reject pending transcript before React cleanup", () => {
    const transitions: VoiceInputContext[] = [
      { ...context, threadId: "thread-b" },
      { ...context, threadId: undefined },
      { ...context, workspacePath: "/workspace/b" },
      { ...context, profileId: "user-b" },
      { ...context, locale: "en" },
      { ...context, revision: 2 }
    ];
    for (const current of transitions) {
      expect(voiceInputContextKey(current)).not.toBe(voiceInputContextKey(context));
      expect(appendVoiceTranscript("new draft", "old transcript", context, current)).toBeUndefined();
    }
    expect(appendVoiceTranscript("draft", " ", context, context)).toBeUndefined();
  });

  test("a new task without a thread ID still has an explicit context generation", () => {
    const original = { ...context, threadId: undefined };
    const next = { ...original, revision: 2 };
    expect(appendVoiceTranscript("new task", "stale", original, next)).toBeUndefined();
  });

  test("undefined new-thread IDs may receive dictation only when the selected-thread ref is also new", () => {
    const expected = { ...context, threadId: undefined };
    const newDraft = { ...expected, threadId: undefined };
    expect(appendVoiceTranscript("new draft", "spoken", expected, newDraft)).toBe("new draft spoken");
    expect(appendVoiceTranscript("new draft", "spoken", expected, { ...newDraft, threadId: "previous-thread" })).toBeUndefined();
    expect(appendVoiceTranscript("new draft", "spoken", expected, { ...newDraft, threadId: "just-created-thread" })).toBeUndefined();
  });

  test("workspace switches invalidate an undefined-thread operation even without a task revision change", () => {
    const expected = { ...context, threadId: undefined };
    const changed = { ...expected, workspacePath: "/workspace/b" };
    expect(appendVoiceTranscript("new workspace draft", "stale", expected, changed)).toBeUndefined();
  });

  test("fast/full state read modes do not masquerade as user Profile identities", () => {
    const fast = { ...context, runtimeProfile: "fast" };
    const full = { ...context, runtimeProfile: "full" };
    expect(voiceInputContextKey(fast)).toBe(voiceInputContextKey(full));
    expect(appendVoiceTranscript("draft", "spoken", fast, full)).toBe("draft spoken");
  });
});
