# Custom Model Access

App product authority: `contracts/app-product-profile.json#codex.auto_model_policy`
and `contracts/app-settings-control-plane.json` in `one-person-lab-app`.

## Default experience

The App ships a maintained official model list generated from the selected
Codex CLI's bundled catalog in an isolated, empty `CODEX_HOME`. Studio intersects
that list with the visible live catalog for ordinary fixed choices. Local custom
or third-party catalog entries are absent until the user enables advanced access.
The current App Auto default is `gpt-6-astra` with `max` reasoning. OPL's built-in
standard Agents are tuned for that model; catalog availability alone does not
establish equivalent Agent behavior on another model.

## Advanced access

Settings → Account & Models → Models & execution owns the setting. A collapsed
**Advanced model options** disclosure sits immediately after Default model. Its
**Enable custom models** switch is off for new and migrated users, uses the
existing Settings store, and is independent of Technical details. Bilingual
Settings search opens the disclosure and focuses the switch.

When enabled, Studio adds visible live-catalog models to explicit fixed choices,
retaining App labels/order for official entries, alias deduplication, hidden-row
filtering, catalog reasoning metadata, and executable `model ?? id` routing.
This display expansion does not overwrite the App list, user catalog, provider
configuration, or credentials. Auto stays within the App-admitted model list,
regardless of the switch; it never silently selects a custom catalog row.

The switch and an active custom selection explain possible standard-Agent
behavior differences. Disabling access preserves a stored custom selection as
unavailable, preserves the draft, and blocks the native composer and the send
handler. The user can restore Auto, choose an admitted model, or re-enable access.
The composer model menu retains its existing model, reasoning, and reset rows.

## Verification and provenance

Model-policy and Settings tests cover default-off migration, explicit opt-in,
Auto stability, hidden rows, aliases, storage, disabled fixed selections, and
wire model names. `node scripts/acceptance/settings-ui.mjs --model-policy-only`
checks the rendered desktop/mobile route, bilingual search focus, switch state,
real fixture `turn/start` model, draft retention, and blocked sends. It uses an
isolated synthetic Host and does not qualify an installed App or a release.

This follow-up narrows the default expansion introduced by Studio #106 while
preserving its useful catalog and wire-name work. The maintainer rule in
`AGENTS.md` requires product evidence before third-party changes alter defaults,
and separate regression coverage for ordinary and explicitly enabled behavior.
