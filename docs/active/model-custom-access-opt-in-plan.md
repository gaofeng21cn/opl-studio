# Custom Model Access Opt-in Repair Plan

This plan records the repair boundary for Studio's live Codex model catalog.
The App product profile remains the owner of model policy; Studio consumes that
policy and owns only the renderer setting, catalog projection, and Codex wire
adapter.

## Decision

The live catalog is useful to advanced users, but it must not widen the ordinary
OPL experience by default. OPL's built-in standard Agents are currently tuned
for `gpt-6-astra` with `max` reasoning. A model that appears in a provider's
catalog is therefore evidence of availability, not evidence that OPL's standard
Agent behavior has been qualified on that model.

The default path remains:

- Auto follows the existing App-owned model and reasoning policy.
- The ordinary fixed-model choices come from the App-admitted model policy.
- The setting `customModelAccessEnabled` is `false` for new and migrated users.
- A standard Agent can never start on a hidden or unavailable model.

Advanced users can open Settings → Account & Models → Advanced model options and
enable custom models. The control must explain that custom and third-party models
may change standard Agent behavior. Once enabled, visible non-hidden live-catalog
models may be selected explicitly as fixed models. The opt-in does not change Auto
resolution or silently replace the current model.

If a user disables the option while a custom model is selected, Studio preserves
the stored selection as unavailable and blocks the next send. The user must
restore Auto, select an App-admitted model, or explicitly re-enable custom models.
This avoids silently changing a deliberate selection while keeping the default
execution path safe.

## Required implementation slices

1. **App policy owner**

   Add a machine-readable custom-model policy to the App product profile. It must
   declare that custom access is advanced-only, default-off, fixed-selection-only,
   and does not change Auto. Add the two localized labels and warning text to the
   App-owned model display contract so Studio does not invent a second product
   policy.

2. **Studio settings state**

   Add `customModelAccessEnabled` to the existing Settings persistence model with
   a `false` default. Render it as an explicit advanced switch with a warning;
   do not hide the switch behind a technical-details flag. Existing stored model
   selections remain readable and revision-safe.

3. **Catalog projection**

   Pass the setting into the existing model resolver. When it is off, omit
   unknown live-catalog rows from fixed choices. When it is on, keep the #106
   alias grouping, hidden-row filtering, display labels, and `wireModel` routing.
   Auto must use the existing App resolver regardless of this switch.

4. **User feedback and persistence**

   Show the enabled state and warning in the Models page. Preserve an explicitly
   selected custom model as unavailable when the option is later disabled. Do not
   reset it silently and do not send it while the option is off.

5. **Verification**

   Add focused coverage for default-off behavior, explicit opt-in, Auto stability,
   hidden rows, stale fixed selections, legacy localStorage, and catalog identity
   versus executable wire names. Candidate evidence must describe the advanced
   gate and must not claim that catalog membership proves standard-Agent support.

## Review and rollout boundary

The repair should land as a follow-up change after #106. #106's catalog and
wire-name work remains useful, but its default expansion is narrowed behind the
advanced setting. The follow-up must be reviewed against the App product profile
and the standard-Agent compatibility statement before any release or installation
claim is made.

This document is a design and implementation plan until the App contract,
Studio consumer, tests, and candidate evidence all carry the same policy.
