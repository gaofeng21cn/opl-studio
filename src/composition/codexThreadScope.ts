import type { Context, Fiber } from "@deepseek-ai/cordis";
import type { HostObservable, SlotScopeAdapter, ScopedStandardSourceBinding, StandardSourceBinding } from "@deepseek-ai/dsh-client-ui-slots";

const absent: StandardSourceBinding = Object.freeze({ key: undefined, hooks: {}, keyedHooks: {}, props: {} });

/** Project the selected canonical Codex thread into the official renderer scope.
 * This adapter owns only the mounted view's fiber, never thread data or storage.
 */
export class CodexThreadScope implements SlotScopeAdapter {
  private binding: StandardSourceBinding = absent;
  private fiber?: Fiber;
  private readonly listeners = new Set<() => void>();
  private readonly targets = new Map<string, HostObservable<StandardSourceBinding>>();
  readonly current: HostObservable<StandardSourceBinding> = {
    getSnapshot: () => this.binding,
    subscribe: (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; },
  };
  private readonly missing: HostObservable<StandardSourceBinding> = { getSnapshot: () => absent, subscribe: () => () => {} };

  constructor(private readonly ctx: Context) {
    ctx.effect(() => () => { this.listeners.clear(); this.targets.clear(); });
  }

  select(threadId: string | undefined): void {
    if (this.binding.key === threadId) return;
    const previous = this.fiber;
    this.fiber = threadId ? this.ctx.plugin({ name: "opl-codex-thread-view", apply() {} }) : undefined;
    this.binding = this.fiber ? { key: threadId!, ctx: this.fiber.ctx, hooks: {}, keyedHooks: {}, props: {} } as ScopedStandardSourceBinding : absent;
    this.targets.clear();
    for (const listener of this.listeners) listener();
    void previous?.dispose();
  }

  bindingSource(target: unknown): HostObservable<StandardSourceBinding> {
    // Only the selected canonical thread has a mounted view. Unknown targets
    // remain absent instead of creating sessions by id.
    if (typeof target !== "string") return this.missing;
    let source = this.targets.get(target);
    if (!source) {
      source = { getSnapshot: () => this.binding.key === target ? this.binding : absent, subscribe: this.current.subscribe };
      this.targets.set(target, source);
    }
    return source;
  }

  renderArea(binding: StandardSourceBinding, props: Parameters<NonNullable<SlotScopeAdapter["renderArea"]>>[1]) {
    return binding.key ? props.children : props.empty?.() ?? null;
  }
}
