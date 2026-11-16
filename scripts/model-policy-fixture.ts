export const syntheticProfile = {
  default_session_profile: {
    model: "codex-future-primary",
    reasoning_effort: "max"
  },
  codex: {
    auto_model_policy: {
      configured_default: {
        model: "codex-future-primary",
        reasoning_effort: "max"
      },
      mode_default: "auto",
      frontier_model_preference_order: ["codex-future-primary", "codex-future-secondary"],
      known_model_reasoning_effort_overrides: {
        "codex-future-primary": "max"
      },
      unknown_default_model_policy: "ignore_catalog_default_for_app_auto",
      unknown_model_reasoning_effort_policy: "highest_supported_reasoning_effort_from_catalog",
      catalog_without_default_policy: "first_available_known_model_then_first_catalog_model",
      catalog_unavailable_fallback: {
        model: "codex-future-primary",
        reasoning_effort: "max"
      }
    }
  },
  gui: {
    home: {
      codex_model_display_options: {
        auto_option: {
          label_zh: "自动（推荐）",
          label_en: "Auto (recommended)"
        },
        visible_models: [
          { id: "codex-future-primary", label_zh: "Future primary zh", label_en: "Future primary" },
          { id: "codex-future-secondary", label_zh: "Future secondary zh", label_en: "Future secondary" }
        ],
        user_reasoning_effort_options: ["low", "high", "xhigh", "max", "ultra"]
      }
    }
  }
};

export function cloneModelPolicyProfile() {
  return structuredClone(syntheticProfile);
}
