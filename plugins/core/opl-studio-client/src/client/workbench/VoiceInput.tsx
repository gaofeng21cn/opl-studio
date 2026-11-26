import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square, X } from "lucide-react";
import { Button, Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import { createVoiceInputController, voiceRecognitionProvider, type VoiceInputState } from "../composition/voiceInputModel";

export { voiceRecognitionProvider } from "../composition/voiceInputModel";
export type VoiceInputButtonProps = {
  locale: "zh" | "en";
  disabled?: boolean;
  onTranscript(text: string): void;
};

export function VoiceInputButton({ locale, disabled = false, onTranscript }: VoiceInputButtonProps) {
  const [state, setState] = useState<VoiceInputState>(() => ({ status: voiceRecognitionProvider() ? "idle" : "unsupported" }));
  const controller = useRef<ReturnType<typeof createVoiceInputController> | null>(null);
  const statusId = useId();
  const zh = locale === "zh";

  useLayoutEffect(() => {
    const current = createVoiceInputController({ onState: setState });
    controller.current = current;
    return () => { current.dispose(); controller.current = null; };
  }, []);
  useLayoutEffect(() => { controller.current?.cancel(); }, [disabled, locale]);
  useEffect(() => {
    const cancel = () => controller.current?.cancel();
    const hidden = () => { if (document.hidden) cancel(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ["recording", "transcribing"].includes(state.status)) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("keydown", escape, true);
    };
  }, [state.status]);

  const active = state.status === "recording" || state.status === "transcribing";
  const label = state.status === "recording" ? (zh ? "停止听写" : "Stop dictation")
    : state.status === "transcribing" ? (zh ? "正在转写" : "Transcribing")
    : state.status === "unsupported" ? (zh ? "语音识别不可用" : "Speech recognition unavailable")
    : (zh ? "语音输入" : "Voice input");
  const message = state.status === "denied" ? (zh ? "麦克风或语音服务访问被拒绝。" : "Microphone or speech service access was denied.")
    : state.status === "unsupported" ? (state.reason === "language-not-supported"
      ? (zh ? "当前语音服务不支持此语言。" : "The speech service does not support this language.")
      : (zh ? "当前运行环境未提供语音识别。" : "Speech recognition is unavailable in this runtime."))
    : state.status === "error" ? (zh ? "听写未完成，请检查麦克风与网络后重试。" : "Dictation failed. Check your microphone and connection, then retry.")
    : state.status === "recording" ? (zh ? "正在听写" : "Recording")
    : state.status === "transcribing" ? (zh ? "正在转写" : "Transcribing") : "";

  return <span className="opl-voice-input" data-voice-state={state.status}>
    <Tooltip label={label} side="top" portal>
      <span title={label}>
        <Button size="sm" variant="toolbar" aria-label={label} aria-pressed={state.status === "recording"}
          aria-describedby={message ? statusId : undefined}
          disabled={disabled || state.status === "unsupported" || state.status === "transcribing"}
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            if (state.status === "recording") controller.current?.stop();
            else controller.current?.start(locale, onTranscript);
          }}>
          {state.status === "recording" ? <Square size={14} aria-hidden="true" />
            : state.status === "transcribing" ? <LoaderCircle size={14} aria-hidden="true" /> : <Mic size={14} aria-hidden="true" />}
        </Button>
      </span>
    </Tooltip>
    {active ? <Tooltip label={zh ? "取消听写" : "Cancel dictation"} side="top" portal>
      <Button size="sm" variant="toolbar" aria-label={zh ? "取消听写" : "Cancel dictation"}
        onMouseDown={event => event.preventDefault()} onClick={() => controller.current?.cancel()}>
        <X size={14} aria-hidden="true" />
      </Button>
    </Tooltip> : null}
    {message ? <span id={statusId} role={state.status === "denied" || state.status === "error" ? "alert" : "status"}>{message}</span> : null}
  </span>;
}

// Keep the existing composer caller on the same implementation.
export const VoiceInput = VoiceInputButton;
