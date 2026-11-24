import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";

export type PluginErrorBoundaryProps = {
  pluginId?: string;
  pluginLabel?: string;
  locale?: "zh" | "en";
  onReloadView?: () => void;
  onOpenSoftwareCenter?: () => void;
  resetKey?: string | number;
  children: ReactNode;
};

type PluginErrorBoundaryState = {
  error: Error | null;
};

/**
 * Isolates single-plugin rendering failures so workbench chat and sibling
 * panels stay interactive when a contributed extension throws.
 */
export class PluginErrorBoundary extends Component<PluginErrorBoundaryProps, PluginErrorBoundaryState> {
  state: PluginErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("OPL plugin UI error boundary caught render failure", {
      pluginId: this.props.pluginId,
      componentStack: info.componentStack,
      error
    });
  }

  componentDidUpdate(prevProps: PluginErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const zh = this.props.locale !== "en";
    const subject = this.props.pluginLabel || this.props.pluginId;
    const heading = zh
      ? "该扩展界面加载异常，已隔离不影响核心对话"
      : "This extension view failed to render and was isolated without affecting core chat.";
    const detailText = this.state.error.message || (zh ? "未知渲染错误" : "Unknown render error");

    return (
      <section
        className="opl-plugin-error-boundary"
        data-testid="opl-plugin-error-boundary-fallback"
        data-plugin-id={this.props.pluginId}
        role="alert"
        style={{
          border: "1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25))",
          borderRadius: "var(--dsw-radius-md, 10px)",
          background: "var(--dsw-alias-bg-layer-1, transparent)",
          color: "var(--dsw-alias-label-primary, inherit)",
          padding: "12px 14px",
          display: "grid",
          gap: "8px"
        }}
      >
        <p style={{ margin: 0, fontWeight: 500 }}>
          {subject ? `${subject}: ${heading}` : heading}
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button type="button" size="sm" variant="outline" onClick={this.reset}>
            {zh ? "重新加载" : "Reload"}
          </Button>
          {this.props.onReloadView ? (
            <Button type="button" size="sm" variant="outline" onClick={this.props.onReloadView}>
              {zh ? "刷新界面" : "Reload view"}
            </Button>
          ) : null}
          {this.props.onOpenSoftwareCenter ? (
            <Button type="button" size="sm" variant="ghost" onClick={this.props.onOpenSoftwareCenter}>
              {zh ? "前往软件中心" : "Open Software Center"}
            </Button>
          ) : null}
        </div>
        <details style={{ color: "var(--dsw-alias-label-secondary, inherit)", fontSize: "0.9em" }}>
          <summary>{zh ? "技术详情" : "Technical details"}</summary>
          <p style={{ margin: "6px 0 0", overflowWrap: "anywhere" }}>{detailText}</p>
        </details>
      </section>
    );
  }
}
