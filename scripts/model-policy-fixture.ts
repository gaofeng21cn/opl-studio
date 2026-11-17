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
      custom_model_access_policy: {
        default_enabled: false,
        surface: "settings_models_collapsed_advanced_disclosure",
        selection: "explicit_fixed_model_only",
        auto_behavior: "unchanged",
        disabled_selection: "preserve_as_unavailable_and_block_send_until_auto_admitted_model_or_explicit_reenable",
        warning_required: true
      },
      frontier_model_preference_order: ["codex-future-primary", "codex-future-secondary"],
      known_model_reasoning_effort_overrides: {
        "codex-future-primary": "max"
      },
      unknown_default_model_policy: "ignore_catalog_default_for_app_auto",
      unknown_model_reasoning_effort_policy: "highest_supported_reasoning_effort_from_catalog",
      catalog_without_default_policy: "first_available_known_model_otherwise_unavailable",
      catalog_unavailable_fallback: {
        model: "codex-future-primary",
        reasoning_effort: "max"
      }
    }
  },
  gui: {
    home: {
      codex_model_display_options: {
        custom_model_access_option: {
          default_enabled: false,
          surface: "settings_models_collapsed_advanced_disclosure",
          label_zh: "启用自定义模型",
          label_en: "Enable custom models",
          description_zh: "自定义模型可能改变 OPL 标准智能体的行为。自动模式保持不变。",
          description_en: "Custom models may change OPL standard-Agent behavior. Auto remains unchanged."
        },
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

export const customModelAccessFixture = {
  defaultEnabled: false as const,
  label: { zh: "启用自定义模型", en: "Enable custom models" },
  description: { zh: "自定义模型可能改变 OPL 标准智能体的行为。自动模式保持不变。", en: "Custom models may change OPL standard-Agent behavior. Auto remains unchanged." }
};
