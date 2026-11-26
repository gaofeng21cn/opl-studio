import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Input, StatusPill, Switch } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { FolderOpen } from "lucide-react";
import {
  contributionLabel,
  type OplContributionSlotOwner,
  type OplSettingsFormEffectTiming,
  type OplSettingsFormField,
  type OplSettingsFormResult,
  type OplSettingsFormScalar,
  type OplUiContribution
} from "./contributionProjection";

type DraftValues = Record<string, OplSettingsFormScalar>;

function initialDraft(result: OplSettingsFormResult): DraftValues {
  const next: DraftValues = {};
  for (const field of result.fields) {
    if (field.fieldType === "secret_ref") {
      next[field.fieldId] = "";
      continue;
    }
    const existing = result.values[field.fieldId];
    if (field.fieldType === "boolean") {
      next[field.fieldId] = Boolean(existing);
    } else if (existing !== undefined && existing !== null) {
      next[field.fieldId] = existing;
    } else if (field.fieldType === "enum") {
      next[field.fieldId] = field.required ? "" : (field.options?.[0]?.value ?? "");
    } else {
      next[field.fieldId] = "";
    }
  }
  return next;
}

function effectTimingLabel(timing: OplSettingsFormEffectTiming, locale: "zh" | "en"): string {
  const labels: Record<OplSettingsFormEffectTiming, [string, string]> = {
    immediate: ["即时生效", "Immediate"],
    next_task: ["下个任务生效", "Next task"],
    restart_required: ["重启后生效", "Restart required"]
  };
  return labels[timing][locale === "zh" ? 0 : 1];
}

function validateField(field: OplSettingsFormField, value: OplSettingsFormScalar | undefined, locale: "zh" | "en"): string | null {
  const label = contributionLabel(field.label, locale, field.fieldId);
  if (field.fieldType === "boolean") return null;
  if (field.fieldType === "secret_ref") {
    const text = typeof value === "string" ? value.trim() : "";
    if (field.required && !field.secretConfigured && !text) {
      return locale === "zh" ? `请填写${label}` : `${label} is required`;
    }
    if (field.maxLength && text.length > field.maxLength) {
      return locale === "zh" ? `${label}最多 ${field.maxLength} 个字符` : `${label} exceeds ${field.maxLength} characters`;
    }
    return null;
  }
  if (field.fieldType === "number") {
    const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
    if (!raw) {
      return field.required ? (locale === "zh" ? `请填写${label}` : `${label} is required`) : null;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      return locale === "zh" ? `请输入有效的数字（${label}）` : `Enter a valid number for ${label}`;
    }
    if (field.min !== undefined && num < field.min) {
      return locale === "zh" ? `${label}不能小于 ${field.min}` : `${label} must be at least ${field.min}`;
    }
    if (field.max !== undefined && num > field.max) {
      return locale === "zh" ? `${label}不能大于 ${field.max}` : `${label} must be at most ${field.max}`;
    }
    return null;
  }
  const text = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  if (field.required && !text.trim()) {
    return locale === "zh" ? `请填写${label}` : `${label} is required`;
  }
  if (field.maxLength && text.length > field.maxLength) {
    return locale === "zh" ? `${label}最多 ${field.maxLength} 个字符` : `${label} exceeds ${field.maxLength} characters`;
  }
  if (field.fieldType === "enum" && text && field.options?.length && !field.options.some(option => option.value === text)) {
    return locale === "zh" ? `请选择有效的${label}` : `Select a valid option for ${label}`;
  }
  return null;
}

export function DeclarativeSettingsForm({ entry, result, owner, onSaved }: {
  entry: OplUiContribution;
  result: OplSettingsFormResult;
  owner: OplContributionSlotOwner;
  onSaved(): void;
}) {
  const zh = owner.locale === "zh";
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<DraftValues>(() => initialDraft(result));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setDraft(initialDraft(result));
    setTouched({});
    setSubmitted(false);
  }, [result]);

  const submitCommand = useMemo(() => {
    if (result.submitCommandId) {
      return entry.commands.find(command => command.commandId === result.submitCommandId);
    }
    return entry.commands.length === 1 ? entry.commands[0] : undefined;
  }, [entry.commands, result.submitCommandId]);

  const errors = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const field of result.fields) {
      map[field.fieldId] = validateField(field, draft[field.fieldId], owner.locale);
    }
    return map;
  }, [draft, owner.locale, result.fields]);

  const markTouched = (fieldId: string) => {
    setTouched(current => (current[fieldId] ? current : { ...current, [fieldId]: true }));
  };

  const updateValue = (fieldId: string, value: OplSettingsFormScalar) => {
    setDraft(current => ({ ...current, [fieldId]: value }));
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!submitCommand || !owner.actionAvailable || submitting) return;
    setSubmitted(true);
    const nextTouched: Record<string, boolean> = {};
    for (const field of result.fields) nextTouched[field.fieldId] = true;
    setTouched(nextTouched);

    const firstInvalid = result.fields.find(field => Boolean(errors[field.fieldId]));
    if (firstInvalid) {
      const errorText = errors[firstInvalid.fieldId]!;
      setStatusMessage(errorText);
      const container = formRef.current?.querySelector<HTMLElement>(`[data-field-id="${firstInvalid.fieldId}"]`);
      const control = container?.querySelector<HTMLElement>("input, select, textarea, button");
      control?.focus();
      return;
    }

    const payloadValues: Record<string, OplSettingsFormScalar> = {};
    let needsRestart = false;
    for (const field of result.fields) {
      const raw = draft[field.fieldId];
      if (field.fieldType === "secret_ref") {
        const secretText = typeof raw === "string" ? raw : "";
        if (secretText) {
          payloadValues[field.fieldId] = secretText;
          if (field.effectTiming === "restart_required") needsRestart = true;
        }
        continue;
      }
      if (field.fieldType === "number") {
        const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
        const serialized = text ? Number(text) : null;
        if (serialized !== result.values[field.fieldId] && field.effectTiming === "restart_required") needsRestart = true;
        payloadValues[field.fieldId] = serialized;
        continue;
      }
      const serialized = raw ?? (field.fieldType === "boolean" ? false : "");
      if (serialized !== result.values[field.fieldId] && field.effectTiming === "restart_required") needsRestart = true;
      payloadValues[field.fieldId] = serialized;
    }

    setSubmitting(true);
    setStatusMessage(zh ? "正在保存设置…" : "Saving settings…");
    try {
      const outcome = await owner.onAction(entry, submitCommand, { values: payloadValues });
      if (outcome && outcome.status === "succeeded") {
        setStatusMessage(
          needsRestart
            ? (zh ? "已保存，重启应用后生效。" : "Saved. Applies after restart.")
            : (zh ? "已保存并同步最新状态。" : "Saved and synchronized.")
        );
        onSaved();
      } else if (outcome && outcome.status === "cancelled") {
        setStatusMessage(outcome.message || (zh ? "已取消，未保存更改。" : "Cancelled. Changes were not saved."));
      } else if (outcome && outcome.status === "pending") {
        setStatusMessage(outcome.message || (zh ? "操作处理中，请稍后刷新查看。" : "Save pending; refresh to confirm."));
      } else if (outcome && outcome.status === "failed") {
        setStatusMessage(outcome.message || (zh ? "保存未完成，输入已保留。" : "Could not save settings. Your input has been preserved."));
      } else {
        setStatusMessage(zh ? "已提交设置请求，请等待状态回读确认。" : "Save requested; waiting for state readback.");
      }
    } catch (reason) {
      setStatusMessage(String((reason as Error)?.message || reason) || (zh ? "保存失败，请重试。" : "Failed to save settings."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="opl-settings-form"
      data-testid={`opl-settings-form-${entry.contributionKey}`}
      onSubmit={event => void handleSubmit(event)}
    >
      {result.status === "restart_pending" ? (
        <div className="opl-contribution-badges">
          <StatusPill state="warning" label={zh ? "存在待重启生效项" : "Restart pending for saved changes"} />
        </div>
      ) : result.status === "attention" ? (
        <div className="opl-contribution-badges">
          <StatusPill state="warning" label={zh ? "需要处理" : "Needs attention"} />
        </div>
      ) : null}
      {result.statusMessage ? (
        <p className="settings-inline-note">{contributionLabel(result.statusMessage, owner.locale, "")}</p>
      ) : null}
      <div className="settings-rows">
        {result.fields.map(field => {
          const fieldDomId = `${formId}-${field.fieldId}`;
          const descId = `${fieldDomId}-desc`;
          const errorId = `${fieldDomId}-err`;
          const label = contributionLabel(field.label, owner.locale, field.fieldId);
          const desc = field.description ? contributionLabel(field.description, owner.locale, "") : undefined;
          const placeholder = field.placeholder ? contributionLabel(field.placeholder, owner.locale, "") : undefined;
          const errorText = errors[field.fieldId];
          const showError = Boolean(errorText && (submitted || touched[field.fieldId]));
          const describedBy = [desc ? descId : null, showError ? errorId : null].filter(Boolean).join(" ") || undefined;
          const value = draft[field.fieldId];

          return (
            <div className="settings-row" data-slot="settings.general.item" data-field-id={field.fieldId} key={field.fieldId}>
              <div className="settings-row-label">
                {field.fieldType === "boolean" || (field.fieldType === "enum" && (field.options?.length ?? 0) <= 5) ? (
                  <span>{label}{field.required ? " *" : ""}</span>
                ) : (
                  <label htmlFor={fieldDomId}>{label}{field.required ? " *" : ""}</label>
                )}
                {desc ? <small id={descId}>{desc}</small> : null}
                <small className="opl-settings-form-timing">{effectTimingLabel(field.effectTiming, owner.locale)}</small>
                {showError ? <p id={errorId} className="opl-form-error" data-error>{errorText}</p> : null}
              </div>
              <div className="settings-row-value">
                {field.fieldType === "boolean" ? (
                  <Switch
                    label={label}
                    checked={Boolean(value)}
                    disabled={Boolean(field.readonly || submitting)}
                    onChange={checked => {
                      markTouched(field.fieldId);
                      updateValue(field.fieldId, checked);
                    }}
                  />
                ) : field.fieldType === "enum" ? (
                  (field.options?.length ?? 0) <= 5 ? (
                    <fieldset
                      className="opl-settings-form-radio-group"
                      disabled={Boolean(field.readonly || submitting)}
                      aria-invalid={showError ? "true" : "false"}
                      aria-describedby={describedBy}
                    >
                      <legend className="visually-hidden">{label}</legend>
                      {(field.options ?? []).map(option => {
                        const checked = value === option.value;
                        return (
                          <label key={option.value} className="opl-settings-form-radio-option" data-checked={checked || undefined}>
                            <input
                              type="radio"
                              name={fieldDomId}
                              value={option.value}
                              checked={checked}
                              onBlur={() => markTouched(field.fieldId)}
                              onChange={event => updateValue(field.fieldId, event.currentTarget.value)}
                            />
                            <span>{contributionLabel(option.label, owner.locale, option.value)}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  ) : (
                    <select
                      id={fieldDomId}
                      className="setting-select"
                      disabled={Boolean(field.readonly || submitting)}
                      aria-invalid={showError ? "true" : "false"}
                      aria-describedby={describedBy}
                      value={typeof value === "string" ? value : ""}
                      onBlur={() => markTouched(field.fieldId)}
                      onChange={event => updateValue(field.fieldId, event.currentTarget.value)}
                    >
                      {field.required && !value ? <option value="">{zh ? "请选择…" : "Select…"}</option> : null}
                      {(field.options ?? []).map(option => (
                        <option key={option.value} value={option.value}>
                          {contributionLabel(option.label, owner.locale, option.value)}
                        </option>
                      ))}
                    </select>
                  )
                ) : field.fieldType === "number" ? (
                  <Input
                    id={fieldDomId}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    readOnly={field.readonly}
                    disabled={submitting}
                    required={field.required}
                    placeholder={placeholder}
                    aria-invalid={showError ? "true" : "false"}
                    aria-describedby={describedBy}
                    value={value === null || value === undefined ? "" : String(value)}
                    onBlur={() => markTouched(field.fieldId)}
                    onChange={event => updateValue(field.fieldId, event.currentTarget.value)}
                  />
                ) : field.fieldType === "directory" ? (
                  <div className="opl-settings-form-directory">
                    <Input
                      id={fieldDomId}
                      type="text"
                      readOnly={field.readonly}
                      disabled={submitting}
                      required={field.required}
                      maxLength={field.maxLength}
                      placeholder={placeholder}
                      aria-invalid={showError ? "true" : "false"}
                      aria-describedby={describedBy}
                      value={typeof value === "string" ? value : ""}
                      onBlur={() => markTouched(field.fieldId)}
                      onChange={event => updateValue(field.fieldId, event.currentTarget.value)}
                    />
                    {owner.pickDirectory ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(field.readonly || submitting)}
                        onClick={() => void owner.pickDirectory?.().then(picked => {
                          if (picked) {
                            markTouched(field.fieldId);
                            updateValue(field.fieldId, picked);
                          }
                        })}
                      >
                        <FolderOpen size={13} aria-hidden="true" />
                        {zh ? "选择目录" : "Choose folder"}
                      </Button>
                    ) : null}
                  </div>
                ) : field.fieldType === "secret_ref" ? (
                  <div className="opl-settings-form-secret">
                    <Input
                      id={fieldDomId}
                      type="password"
                      autoComplete="new-password"
                      readOnly={field.readonly}
                      disabled={submitting}
                      required={Boolean(field.required && !field.secretConfigured)}
                      maxLength={field.maxLength}
                      placeholder={placeholder || (field.secretConfigured ? (zh ? "已配置，留空保持不变" : "Configured; leave empty to keep") : undefined)}
                      aria-invalid={showError ? "true" : "false"}
                      aria-describedby={describedBy}
                      value={typeof value === "string" ? value : ""}
                      onBlur={() => markTouched(field.fieldId)}
                      onChange={event => updateValue(field.fieldId, event.currentTarget.value)}
                    />
                    <StatusPill
                      state={field.secretConfigured ? "done" : "idle"}
                      label={field.secretConfigured ? (zh ? "已配置" : "Configured") : (zh ? "未配置" : "Not configured")}
                    />
                  </div>
                ) : field.multiline ? (
                  <textarea
                    id={fieldDomId}
                    className="opl-settings-form-textarea"
                    rows={3}
                    readOnly={field.readonly}
                    disabled={submitting}
                    required={field.required}
                    maxLength={field.maxLength}
                    placeholder={placeholder}
                    aria-invalid={showError ? "true" : "false"}
                    aria-describedby={describedBy}
                    value={typeof value === "string" ? value : ""}
                    onBlur={() => markTouched(field.fieldId)}
                    onChange={event => updateValue(field.fieldId, event.currentTarget.value)}
                  />
                ) : (
                  <Input
                    id={fieldDomId}
                    type="text"
                    readOnly={field.readonly}
                    disabled={submitting}
                    required={field.required}
                    maxLength={field.maxLength}
                    placeholder={placeholder}
                    aria-invalid={showError ? "true" : "false"}
                    aria-describedby={describedBy}
                    value={typeof value === "string" ? value : ""}
                    onBlur={() => markTouched(field.fieldId)}
                    onChange={event => updateValue(field.fieldId, event.currentTarget.value)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="opl-settings-form-actions">
        {submitCommand ? (
          <Button type="submit" variant="primary" size="sm" disabled={!owner.actionAvailable || submitting}>
            {submitting ? (zh ? "保存中…" : "Saving…") : contributionLabel(submitCommand.label, owner.locale, submitCommand.commandId)}
          </Button>
        ) : null}
        <p className="opl-settings-form-status" role="status" aria-live="polite">{statusMessage}</p>
      </div>
    </form>
  );
}
