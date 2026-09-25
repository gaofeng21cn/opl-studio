import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = '/opt/opl';
fs.mkdirSync(`${root}/seed`, { recursive: true });
const write = (name, value) => fs.writeFileSync(`${root}/${name}`, JSON.stringify(value, null, 2) + '\n');
write('image-manifest.json', {
  schema: 'dev.onepersonlab.opl-webui-image-manifest.v2',
  image_role: 'opl_webui_runtime_image', application_host: 'opl-studio',
  base_image_family: 'node:22-bookworm-slim',
  webui_package: { name: 'opl-studio', source_commit: process.env.OPL_SOURCE_REVISION },
  app_source_commit: process.env.OPL_APP_REF,
  data_dir: '/data', projects_dir: '/projects', seed_dir: `${root}/seed`,
  seed_metadata: `${root}/seed/metadata.json`, seed_strategy: 'payload_preheated',
  official_profile_resources: `${root}/resources/opl-official-profile`,
});
write('seed/metadata.json', {
  schema: 'dev.onepersonlab.opl-webui-image-seed.v2',
  data_dir: '/data', projects_dir: '/projects', strategy: 'payload_preheated',
  components: [
    { id: 'opl_framework', version: execFileSync('/opt/opl-framework/bin/opl', ['--version'], { encoding: 'utf8' }).trim(), source: 'gaofeng21cn/one-person-lab', source_fingerprint: process.env.OPL_FRAMEWORK_REF, payload_path: '/opt/opl-framework', receipt_kind: 'embedded_runtime' },
    { id: 'codex_cli', version: execFileSync('/opt/codex/bin/codex', ['--version'], { encoding: 'utf8' }).trim(), source: process.env.OPL_CODEX_NPM_SPEC, source_fingerprint: process.env.OPL_CODEX_NPM_SPEC, payload_path: '/opt/codex', receipt_kind: 'embedded_runtime' },
  ],
});
