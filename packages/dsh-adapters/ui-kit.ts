export {
  Button,
  Checkbox,
  DisclosureRow,
  Input,
  Menu,
  Modal,
  Pill,
  RiskConfirmation,
  SegmentedTabs,
  StateDot,
  Switch,
  Tag,
  Tooltip,
  type ButtonVariant,
  type MenuEntry,
  type SegmentedTab,
  type StateDotState,
  type TagTone
} from "@deepseek-ai/dsh-client-ui-primitives";
export {
  PluginErrorBoundary,
  type PluginErrorBoundaryProps
} from "./ui-kit/PluginErrorBoundary";
export {
  SettingRow,
  SettingsGroup,
  StatusPill,
  EmptyState
} from "./ui-kit/SettingsPrimitives";
export {
  OPL_SETTINGS_GROUP_DESTINATIONS,
  OPL_SETTINGS_GROUP_META,
  oplSettingsGroupSlotName,
  registerOplSettingsGroup,
  readOplSettingsGroupMeta,
  type OplSettingsGroupDestination,
  type OplSettingsGroupSlotName,
  type OplSettingsGroupMeta,
  type OplSettingsGroupOwner,
  type OplSettingsGroupSlotRegistry
} from "./ui-kit/settingsSlots";
export {
  OPL_STUDIO_SHELL_SERVICE,
  useOplLocale,
  useOplStudioShellSnapshot,
  OplSettingsNavigationContext,
  useOplSettingsNavigation,
  type OplSettingsNavigationApi
} from "./ui-kit/hooks";
