#!/usr/bin/env bash
set -euo pipefail

payload=${1:?Missing packaged Linux payload}
[[ "$payload" == /mnt/*/opl-wsl-host ]] || { printf 'Invalid OPL bootstrap payload path.\n' >&2; exit 64; }
[[ "$(id -u)" == 0 ]] || { printf 'OPL guest bootstrap requires root.\n' >&2; exit 64; }
[[ -x "$payload/runtime/node/bin/node" ]] || { printf 'Packaged Linux Node is unavailable.\n' >&2; exit 69; }
legacy_identity=0
if [[ -f /etc/opl/identity.json ]]; then legacy_identity=1; fi

# The host already verifies the full payload inventory. Recheck the exact
# bootstrap paths before privileged guest installation, without eval or shell text.
mapfile -t binding < <("$payload/runtime/node/bin/node" --input-type=module - "$payload" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.argv[2], manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const b=manifest.bootstrap;
if(manifest.schema!=='opl_studio_windows_guest_host.v1'||b?.node?.root!=='runtime/node'
  ||b?.codex?.path!=='runtime/codex/vendor/x86_64-unknown-linux-musl/bin/codex'||b?.framework_installer!=='runtime/opl-install.sh'
  ||!/^v?\d+\.\d+\.\d+$/.test(b.node.version)||!/^\d+\.\d+\.\d+$/.test(b.codex.version)
  ||! /^[0-9a-f]{40}$/.test(b.framework_ref)) throw Error('Invalid bootstrap manifest');
for(const relative of ['runtime/node/bin/node',b.codex.path,b.framework_installer,'desktop/windows-guest-inspect.mjs']) {
  const expected=manifest.files.find(item=>item.path===relative)?.sha256;
  if(!expected||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')!==expected) throw Error('Bootstrap byte mismatch');
}
console.log(b.framework_ref);console.log(b.node.version);console.log(b.codex.version);
NODE
)
[[ ${#binding[@]} == 3 ]] || { printf 'Incomplete OPL bootstrap binding.\n' >&2; exit 65; }
framework_ref=${binding[0]}

export DEBIAN_FRONTEND=noninteractive
if [[ "$legacy_identity" != 1 ]]; then
  apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update
  apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 install -y --no-install-recommends ca-certificates curl git python3 build-essential unzip
fi
if ! id opl >/dev/null 2>&1; then useradd --create-home --shell /bin/bash opl; fi
[[ "$(getent passwd opl | cut -d: -f6)" == /home/opl ]] || { printf 'OPL guest user has an unexpected home.\n' >&2; exit 65; }
install -d -m 0755 /opt/opl/studio-runtime /opt/opl/studio-bootstrap /etc/opl-studio
for binding in node:node codex:codex-root; do
  source=${binding%%:*}
  target=${binding##*:}
  rm -rf "/opt/opl/studio-runtime/$target.pending"
  cp -a "$payload/runtime/$source" "/opt/opl/studio-runtime/$target.pending"
  if [[ -e "/opt/opl/studio-runtime/$target" ]]; then
    rm -rf "/opt/opl/studio-runtime/$target.previous"
    mv "/opt/opl/studio-runtime/$target" "/opt/opl/studio-runtime/$target.previous"
  fi
  mv "/opt/opl/studio-runtime/$target.pending" "/opt/opl/studio-runtime/$target"
done
install -m 0644 "$payload/desktop/windows-guest-inspect.mjs" /opt/opl/studio-bootstrap/inspect.mjs
for command in node npm npx; do ln -sfn "/opt/opl/studio-runtime/node/bin/$command" "/usr/local/bin/$command"; done
ln -sfn /opt/opl/studio-runtime/codex-root/vendor/x86_64-unknown-linux-musl/bin/codex /usr/local/bin/codex
install -d -o opl -g opl -m 0700 /home/opl/.codex /home/opl/code
# Persist the first-install intent before Framework creates owner state. Existing
# upgrades retain their receipt and never enter this path.
runuser -u opl -- env HOME=/home/opl OPL_STATE_DIR='/home/opl/Library/Application Support/OPL/state' \
  OPL_STUDIO_OFFICIAL_PROFILE_MODULE="$payload/desktop/official-profile.mjs" \
  /usr/local/bin/node --input-type=module -e 'import { pathToFileURL } from "node:url"; const module = await import(pathToFileURL(process.env.OPL_STUDIO_OFFICIAL_PROFILE_MODULE).href); module.captureOfficialProfileAdmission({ homeDir: "/home/opl", env: process.env });'
runuser -u opl -- /usr/bin/env HOME=/home/opl CODEX_HOME=/home/opl/.codex \
  /usr/local/bin/node --input-type=module - "$payload" <<'NODE'
import { pathToFileURL } from 'node:url';
const {captureOfficialProfileAdmission}=await import(pathToFileURL(process.argv[2]+'/desktop/official-profile.mjs').href);
captureOfficialProfileAdmission({homeDir:'/home/opl',env:{HOME:'/home/opl',CODEX_HOME:'/home/opl/.codex'}});
NODE
runuser -u opl -- /usr/bin/env HOME=/home/opl CODEX_HOME=/home/opl/.codex OPL_CODEX_BIN=/usr/local/bin/codex \
  OPL_WORKSPACE_ROOT=/home/opl/code OPL_INSTALL_DIR=/home/opl/.opl/one-person-lab \
  "OPL_INSTALL_BRANCH=$framework_ref" OPL_INSTALL_SOURCE_MODE=archive \
  "OPL_SOURCE_ARCHIVE_URL=https://github.com/gaofeng21cn/one-person-lab/archive/$framework_ref.tar.gz" \
  PATH=/usr/local/bin:/usr/bin:/bin /bin/bash "$payload/runtime/opl-install.sh" --headless --skip-packages

"$payload/runtime/node/bin/node" --input-type=module - "$payload" <<'NODE'
import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';
const manifest=JSON.parse(fs.readFileSync(path.join(process.argv[2],'manifest.json'),'utf8'));
const file='/etc/opl-studio/identity.json';
let previous;try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
const identity={schema:'opl_studio_linux_runtime_identity.v1',guest_install_id:previous?.guest_install_id||crypto.randomUUID(),distribution_generation:previous?.distribution_generation||1,framework_ref:manifest.bootstrap.framework_ref};
fs.writeFileSync(file+'.pending',JSON.stringify(identity)+'\n',{mode:0o644});fs.renameSync(file+'.pending',file);
NODE
runuser -u opl -- /usr/local/bin/node /opt/opl/studio-bootstrap/inspect.mjs --json
