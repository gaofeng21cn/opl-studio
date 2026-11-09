# Third-Party Notices

## DeepSeek Harness

OPL Studio directly reuses the pinned DeepSeek Harness Application Host cohort:

- `@deepseek-ai/cordis` `4.1.0`;
- `@deepseek-ai/cordis-plugin-group` `1.1.0`;
- `@deepseek-ai/cordis-plugin-include` `1.1.0`;
- `@deepseek-ai/cordis-plugin-loader` `1.1.0`;
- `@deepseek-ai/dsh-app-boot`, `dsh-brand`, `dsh-client-modules`,
  `dsh-client-ui-primitives`, `dsh-client-ui-slots`, `dsh-client-ui-dockkit`,
  `dsh-client-web`, `dsh-agent-preset-registry`,
  `dsh-home-paths`, `dsh-host-frontend-static`,
  `dsh-host-plugin-inventory`, `dsh-host-webserver`,
  `dsh-launch-environment`, `dsh-system-prompt`, `dsh-tools`, `dsh-sandbox`, `dsh-sandbox-policy`, and
  `dsh-typert-protocol`, `dsh-client-store`, and
  `dsh-util-workspace-path`, `dsh-util-file-drag`, `dsh-util-values`,
  `dsh-client-connection` (public Peer type/primitive only), and
  `dsh-tool-executor-native`, all at `0.2.2-rc.1`;
- `use-sync-external-store` `1.7.0` for the vendored renderer closure;
- `zustand` `5.1.0` and `immer` `11.2.9` for the DSH client store runtime
  closure (MIT, pmndrs and Michel Weststrate);
- Lexical and its history, plain-text, text, and utility modules `0.53.0`
  for the upstream composer (MIT, Meta Platforms, Inc. and affiliates);
- `simple-icons` `16.36.0` for upstream client icon assets (CC0-1.0,
  <https://creativecommons.org/publicdomain/zero/1.0/>).

Exact package integrity values are pinned in `package-lock.json` and the
Application Host package cohort is repeated in
`src/composition/deepseekHarnessSourceManifest.json`.

Source repository: <https://github.com/deepseek-ai/deepseek-harness>

Inspected source ref: `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`

The complete `src/` trees of nineteen client packages are vendored from that ref under `src/vendor/deepseek-harness/packages/client/`:

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
- `ui-context-menu`
- `ui-renderer`
- `ui-sidebar-files`
- `ui-sidebar-documentpreview`
- `ui-sidebar-right`
- `ui-deliverables`
- `ui-open-in-app`
- `ui-dockkit`
- `resources`

The upstream `packages/util/workspace-path/src` helpers are also vendored from
the same ref so renderer imports resolve to the pinned source helpers.

The snapshot contains 633 files, including the upstream `LICENSE`. Its package
roots, per-file SHA-256 inventory, source package version (`0.2.2-rc.1`), and
update boundary are recorded in
`src/composition/deepseekHarnessSourceManifest.json`; `npm run verify:dsh-gui`
checks every local digest and reverts the declared React 19 compatibility patch
in a temporary copy to prove the original upstream bytes. Nine upstream GUI
files carry this bounded patch: ref initialization, nullable DOM refs, the boolean
`inert` attribute, and Tooltip ref/cleanup forwarding. The patch digest, pinned
upstream ref, and each changed file's original SHA-256 are recorded explicitly;
all other files remain byte-identical. The replay applies this patch after copying
the official source, without introducing another runtime or state owner.

The live One Person Lab composition directly renders upstream `AppFrame`,
`SidebarRoot`, `WorkspaceBrowser`, `ConversationRoot`/`EmptyHero`, `InputBar`,
`AgentPresetSeat`, `ModelSelect`, and `SettingsRoot`.
`SlotCore` and the pinned `ui-renderer` source for `createSlotRenderer()` provide
registration, disposal, and entry error isolation. OPL components import `Button`, `Pill`, `Input`, `Tooltip`,
`StateDot`, `projectUserText`, and icons directly from the vendored upstream
`@deepseek-ai/dsh-client-ui-primitives` index. User-visible identity uses the
DSH 0.2.2-rc.1 brand slots with the text `One Person Lab`; no OPL logo, parallel
type scale, layout, color system, primitive control, or icon is introduced. The
DSH 0.2.2-rc.1 attachment slot is occupied by a null adapter and does not enable a
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

## Community client plugins

Studio uses the pinned DSH `ui-sidebar-documentpreview` source (MIT),
from https://github.com/deepseek-ai/deepseek-harness, through the vendored
source manifest.
integrity and exact payload hashes; the original license and package metadata
are included. The Host half is not loaded; the public content provider reads
through Studio's canonical thread workspace bridge. No peer metadata is changed.

`@objectivex666/dsh-settings-search` 1.2.0 is an unmodified, separately loaded
GPL-3.0 client plugin from https://github.com/objectivex666/dsh-settings-search
(tag v1.2.0). Its license is included in renderer `plugins/` output. This local
search version does not introduce an AI provider or credential store.
Source and installation instructions remain available in that upstream repository.
The notices and corresponding source availability must accompany distribution;
these plugins' licenses are not replaced by Studio's MIT license.

## jsdiff

The upstream DiffBlock uses `diff` `9.0.0` for read-only diff rendering.
Source: <https://github.com/kpdecker/jsdiff>.

```text
BSD 3-Clause License

Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## MCP Apps SDK

`@modelcontextprotocol/ext-apps` 2.0.4 supplies the standard AppBridge and
PostMessageTransport used by the embedded MCP App host. Source:
<https://github.com/modelcontextprotocol/ext-apps>. The upstream license
transition notice and license text are reproduced below.

```text
The MCP project is undergoing a licensing transition from the MIT License to the Apache License, Version 2.0 ("Apache-2.0"). All new code and specification contributions to the project are licensed under Apache-2.0. Documentation contributions (excluding specifications) are licensed under CC-BY-4.0.

Contributions for which relicensing consent has been obtained are licensed under Apache-2.0. Contributions made by authors who originally licensed their work under the MIT License and who have not yet granted explicit permission to relicense remain licensed under the MIT License.

No rights beyond those granted by the applicable original license are conveyed for such contributions.

---

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to the Licensor for inclusion in the Work by the copyright
      owner or by an individual or Legal Entity authorized to submit on behalf
      of the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

---

MIT License

Copyright (c) 2024-2025 Model Context Protocol a Series of LF Projects, LLC.

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

---

Creative Commons Attribution 4.0 International (CC-BY-4.0)

Documentation in this project (excluding specifications) is licensed under
CC-BY-4.0. See https://creativecommons.org/licenses/by/4.0/legalcode for
the full license text.
```
