# Third-Party Notices

## DeepSeek Harness

OPL Studio directly reuses the pinned DeepSeek Harness Application Host cohort:

- `@deepseek-ai/cordis` `4.0.2`;
- `@deepseek-ai/cordis-plugin-group` `1.0.2`;
- `@deepseek-ai/cordis-plugin-include` `1.0.7`;
- `@deepseek-ai/cordis-plugin-loader` `1.0.3`;
- `@deepseek-ai/dsh-app-boot`, `dsh-brand`, `dsh-client-modules`,
  `dsh-client-ui-primitives`, `dsh-client-ui-slots`, `dsh-client-web`,
  `dsh-home-paths`, `dsh-host-frontend-static`,
  `dsh-host-plugin-inventory`, `dsh-host-webserver`, `dsh-invariants`,
  `dsh-launch-environment`, `dsh-system-prompt`, `dsh-tools`, and
  `dsh-typert-protocol`, `dsh-client-store`, `dsh-agent-presets`, and
  `dsh-util-workspace-path`, all at `0.1.2-rc.1`;
- `use-sync-external-store` `1.2.0` for the vendored renderer closure;
- Lexical and its history, plain-text, text, and utility modules `0.49.0`
  for the upstream composer (MIT, Meta Platforms, Inc. and affiliates).

Exact package integrity values are pinned in `package-lock.json` and the
Application Host package cohort is repeated in
`src/composition/deepseekHarnessSourceManifest.json`.

Source repository: <https://github.com/deepseek-ai/deepseek-harness>

Inspected source ref: `a66e4702047846cdaa10c66c9d3df3951f5ea70d`

The complete `src/` trees of eleven GUI packages are vendored byte-for-byte from
that ref under `src/vendor/deepseek-harness/packages/client/`:

- `ui-layout`
- `ui-sidebar`
- `ui-conversation`
- `ui-input-trigger`
- `ui-model-selection`
- `ui-agent-preset`
- `ui-workspace`
- `ui-settings-general`
- `ui-theme`
- `ui-primitives`
- `ui-renderer`

The snapshot contains 250 files, including the upstream `LICENSE`. Its package
roots, per-file SHA-256 inventory, source package version (`0.1.2-rc.1`), and
update boundary are recorded in
`src/composition/deepseekHarnessSourceManifest.json`; `npm run verify:dsh-gui`
checks local byte parity. OPL changes stay outside the vendor root.

The live One Person Lab composition directly renders upstream `AppFrame`,
`SidebarRoot`, `WorkspaceBrowser`, `ConversationRoot`/`EmptyHero`, `InputBar`,
`AgentPresetSeat`, `ModelSelect`, and `SettingsRoot`.
`SlotCore` and the pinned `ui-renderer` source for `createSlotRenderer()` provide
registration, disposal, and entry error isolation. OPL components import `Button`, `Pill`, `Input`, `Tooltip`,
`StateDot`, `MessageText`, and icons directly from the vendored upstream
`@deepseek-ai/dsh-client-ui-primitives` index. User-visible identity uses the
RC2 brand slots with the text `OPL` / `One Person Lab`; no OPL logo, parallel
type scale, layout, color system, primitive control, or icon is introduced. The
RC2 attachment slot is occupied by a null adapter and does not enable a
multimodal runtime. Workspace host description remains unavailable until the
App ABI supplies it; the POSIX home-path compatibility shim therefore does not
claim a visible `~` abbreviation.

The `opl-studio` profile adopts DSH boot, profile/patch loading, Cordis plugin
lifecycle, native tool registry, WebServer, frontend modules, and plugin
inventory. OPL-owned plugins provide Codex, Framework bridging, Host APIs, and
Web routes. The profile does not load `dsh-base`; DeepSeek Harness session, LLM
provider routing, Agent loop, and credential authority are not adopted.

Tools registered in DSH `ctx.tools` are exposed to the persistent Codex App
Server through an authenticated stateful loopback MCP endpoint. The browser
Client Cordis graph remains derived from the Framework Host graph and App-owned
profile/slot policy; it does not discover OPL Packages or create another
registry, currentness, state, session, or action authority.

MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## use-sync-external-store

MIT License

Copyright (c) Facebook, Inc. and its affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
