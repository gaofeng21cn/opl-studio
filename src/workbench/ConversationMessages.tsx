import { useState, type ReactNode } from "react";
import type { WorkbenchThreadMessage } from "./workbenchModel";

type Props = {
  threadId?: string;
  activeTurnId?: string;
  messages: WorkbenchThreadMessage[];
  start: number;
  end: number;
  running: boolean;
  locale: "zh" | "en";
  events: string[];
  renderContent(message: WorkbenchThreadMessage): ReactNode;
};

// Display state only: canonical items and execution/approval state stay with Codex.
// Keep choices above paginated rows, scoped by thread/turn/item identity.
export function ConversationMessages(props: Props) {
  const { messages, threadId, activeTurnId, running, locale, start, end } = props;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const zh = locale === "zh";
  const keyFor = (message: WorkbenchThreadMessage) => JSON.stringify([threadId, message.turnId, message.itemId ?? message.id]);
  const eventKey = JSON.stringify([threadId, "live-events"]);
  const details = messages.filter(message => message.presentation);
  const latestProgress = running && activeTurnId
    ? messages.filter(message => message.turnId === activeTurnId && message.presentation === "progress").at(-1)
    : undefined;
  const toggle = (key: string) => setExpanded(current => ({ ...current, [key]: !current[key] }));
  const setAll = (open: boolean) => setExpanded(current => ({
    ...current,
    ...Object.fromEntries(details.map(message => [keyFor(message), open])),
    [eventKey]: open
  }));

  return <>
    {running ? <div className="conversation-progress" role="status">
      <strong>{zh ? "正在执行" : "Working"}</strong>
      {latestProgress ? <p>{latestProgress.text.slice(0, 240)}{latestProgress.text.length > 240 ? "…" : ""}</p> : null}
    </div> : null}
    {details.length || running ? <div className="execution-controls" role="group" aria-label={zh ? "执行详情显示" : "Execution detail display"}>
      <button type="button" onClick={() => setAll(true)}>{zh ? "展开全部详情" : "Expand all details"}</button>
      <button type="button" onClick={() => setAll(false)}>{zh ? "收起全部详情" : "Collapse all details"}</button>
    </div> : null}
    {messages.slice(start, end).map(message => {
      const key = keyFor(message);
      const open = expanded[key] === true;
      const disclosure = Boolean(message.presentation);
      const status = ({
        completed: zh ? "已完成" : "Completed",
        inProgress: zh ? "进行中" : "In progress",
        failed: zh ? "失败" : "Failed",
        error: zh ? "失败" : "Failed",
        declined: zh ? "已拒绝" : "Declined"
      } as Record<string, string>)[message.executionStatus ?? ""];
      return <article key={key} data-testid={message.role === "assistant" ? "opl-conversation-event" : undefined}
        className={`message ${message.role}${message.subagent ? " subagent" : ""}${disclosure ? " execution-message" : ""}`}>
        {message.failureSummary !== undefined ? <p className="execution-failure" role="alert">
          <strong>{zh ? "执行未成功" : "Execution unsuccessful"}</strong>{message.failureSummary ? ` · ${message.failureSummary}` : ""}
        </p> : null}
        {disclosure ? <>
          <button type="button" className="execution-toggle" aria-expanded={open} onClick={() => toggle(key)}>
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            {message.presentation === "progress" ? (zh ? "进度详情" : "Progress details") : (zh ? "执行详情" : "Execution details")}
            {status ? <span className="execution-status">{status}</span> : null}
          </button>
          {open ? props.renderContent(message) : null}
        </> : props.renderContent(message)}
      </article>;
    })}
    {running && props.events.length ? <div className="execution-message">
      <button type="button" className="execution-toggle" aria-expanded={expanded[eventKey] === true} onClick={() => toggle(eventKey)}>
        <span aria-hidden="true">{expanded[eventKey] ? "▾" : "▸"}</span>{zh ? "实时事件" : "Live events"}
      </button>
      {expanded[eventKey] ? <div className="run-events">{props.events.slice().reverse().map((event, index) => <span key={index}>{event}</span>)}</div> : null}
    </div> : null}
  </>;
}
