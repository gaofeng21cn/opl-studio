import { useMemo, useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import type { CodexPendingServerRequest } from "../bridge/oplBridge";

type ResponsePayload = { result?: unknown; error?: { code: number; message: string } };

type Props = {
  requests: CodexPendingServerRequest[];
  locale: "zh" | "en";
  error?: string;
  onRespond(request: CodexPendingServerRequest, response: ResponsePayload): void;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function deny(message: string): ResponsePayload {
  return { error: { code: -32001, message } };
}

function UserInputRequest({ request, locale, onRespond }: { request: CodexPendingServerRequest; locale: "zh" | "en"; onRespond: Props["onRespond"] }) {
  const params = request.params as { questions?: Array<{ id?: string; header?: string; question?: string; options?: Array<{ label?: string; description?: string }>; isSecret?: boolean }> };
  const questions = Array.isArray(params.questions) ? params.questions.filter((question) => typeof question.id === "string" && typeof question.question === "string") : [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = questions.every((question) => Boolean(answers[question.id as string]?.trim()));
  return <>
    {questions.map((question) => {
      const id = question.id as string;
      return <label className="codex-server-request-field" key={id}>
        <span>{question.header || question.question}</span>
        <small>{question.question}</small>
        {question.options?.length ? <select value={answers[id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [id]: event.currentTarget.value }))}>
          <option value="">{locale === "zh" ? "请选择" : "Choose"}</option>
          {question.options.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
        </select> : <input type={question.isSecret ? "password" : "text"} value={answers[id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [id]: event.currentTarget.value }))} />}
      </label>;
    })}
    <div className="codex-server-request-actions">
      <button type="button" className="secondary" onClick={() => onRespond(request, deny(locale === "zh" ? "用户拒绝提供输入。" : "The user declined to provide input."))}><X aria-hidden="true" size={14} />{locale === "zh" ? "拒绝" : "Decline"}</button>
      <button type="button" className="primary" disabled={!complete} onClick={() => onRespond(request, { result: { answers: Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, { answers: [value] }])) } })}><Check aria-hidden="true" size={14} />{locale === "zh" ? "提交" : "Submit"}</button>
    </div>
  </>;
}

function ElicitationRequest({ request, locale, onRespond }: { request: CodexPendingServerRequest; locale: "zh" | "en"; onRespond: Props["onRespond"] }) {
  const params = request.params as { message?: string; mode?: string; requestedSchema?: { properties?: Record<string, { title?: string; type?: string; enum?: string[] }> }; serverName?: string };
  const fields = useMemo(() => Object.entries(params.requestedSchema?.properties ?? {}), [params.requestedSchema]);
  const [values, setValues] = useState<Record<string, string>>({});
  return <>
    <p className="codex-server-request-message">{text(params.message) || (locale === "zh" ? "MCP 服务请求输入。" : "The MCP server requested input.")}</p>
    {fields.map(([id, schema]) => <label className="codex-server-request-field" key={id}>
      <span>{schema.title || id}</span>
      {schema.enum?.length ? <select value={values[id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [id]: event.currentTarget.value }))}><option value="">{locale === "zh" ? "请选择" : "Choose"}</option>{schema.enum.map((value) => <option key={value} value={value}>{value}</option>)}</select> : <input type={schema.type === "boolean" ? "checkbox" : "text"} checked={schema.type === "boolean" ? values[id] === "true" : undefined} value={schema.type === "boolean" ? undefined : values[id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [id]: schema.type === "boolean" ? String(event.currentTarget.checked) : event.currentTarget.value }))} />}
    </label>)}
    <div className="codex-server-request-actions">
      <button type="button" className="secondary" onClick={() => onRespond(request, { result: { action: "decline" } })}><X aria-hidden="true" size={14} />{locale === "zh" ? "拒绝" : "Decline"}</button>
      <button type="button" className="primary" onClick={() => onRespond(request, { result: { action: "accept", content: values } })}><Check aria-hidden="true" size={14} />{locale === "zh" ? "提交" : "Submit"}</button>
    </div>
  </>;
}

export function CodexServerRequestPanel({ requests, locale, error, onRespond }: Props) {
  if (!requests.length && !error) return null;
  const copy = locale === "zh"
    ? { title: "需要你的确认", command: "命令执行请求", file: "文件变更请求", permission: "额外权限请求", input: "需要补充信息", elicitation: "MCP 服务请求", unknown: "未知 Codex 请求", unavailable: "此请求没有可安全投影的界面。" }
    : { title: "Confirmation required", command: "Command approval", file: "File change approval", permission: "Additional permissions", input: "More information needed", elicitation: "MCP server request", unknown: "Unknown Codex request", unavailable: "This request has no safe UI projection." };
  return <section className="codex-server-request-panel" aria-live="assertive">
    <header><ShieldAlert aria-hidden="true" size={16} /><strong>{copy.title}</strong><span>{requests.length}</span></header>
    {error ? <p className="dialog-error" role="alert">{error}</p> : null}
    {requests.map((request) => {
      const params = request.params as Record<string, unknown>;
      const title = request.method === "item/commandExecution/requestApproval" ? copy.command
        : request.method === "item/fileChange/requestApproval" ? copy.file
          : request.method === "item/permissions/requestApproval" ? copy.permission
            : request.method === "item/tool/requestUserInput" ? copy.input
              : request.method === "mcpServer/elicitation/request" ? copy.elicitation
                : copy.unknown;
      const reason = text(params.reason) || text(params.command) || text(params.serverName);
      return <article className="codex-server-request" key={`${request.method}:${request.id}`}>
        <div className="codex-server-request-heading"><strong>{title}</strong><code>{String(request.id)}</code></div>
        {reason ? <p className="codex-server-request-message">{reason}</p> : null}
        {request.method === "item/tool/requestUserInput" ? <UserInputRequest request={request} locale={locale} onRespond={onRespond} />
          : request.method === "mcpServer/elicitation/request" ? <ElicitationRequest request={request} locale={locale} onRespond={onRespond} />
            : request.method === "item/commandExecution/requestApproval" || request.method === "item/fileChange/requestApproval" ? <div className="codex-server-request-actions">
              <button type="button" className="secondary" onClick={() => onRespond(request, { result: { decision: "decline" } })}><X aria-hidden="true" size={14} />{locale === "zh" ? "拒绝" : "Decline"}</button>
              <button type="button" className="primary" onClick={() => onRespond(request, { result: { decision: "accept" } })}><Check aria-hidden="true" size={14} />{locale === "zh" ? "允许" : "Allow"}</button>
            </div>
              : request.method === "item/permissions/requestApproval" ? <div className="codex-server-request-actions">
                <button type="button" className="secondary" onClick={() => onRespond(request, deny(locale === "zh" ? "用户拒绝额外权限。" : "The user declined additional permissions."))}><X aria-hidden="true" size={14} />{locale === "zh" ? "拒绝" : "Decline"}</button>
                <button type="button" className="primary" onClick={() => onRespond(request, { result: { permissions: params.permissions ?? {}, scope: "turn" } })}><Check aria-hidden="true" size={14} />{locale === "zh" ? "本回合允许" : "Allow this turn"}</button>
              </div>
                : <><p className="codex-server-request-message">{copy.unavailable}</p><button type="button" className="secondary" onClick={() => onRespond(request, deny("Unsupported Codex server request UI."))}><X aria-hidden="true" size={14} />{locale === "zh" ? "拒绝" : "Decline"}</button></>}
      </article>;
    })}
  </section>;
}
