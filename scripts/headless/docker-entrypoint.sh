#!/bin/sh
set -eu
# Older OPL images wrote the App data volume as root. Repair only root-owned
# entries in that App-owned volume; never recurse into user project files.
if [ "$(id -u)" = 0 ]; then
  mkdir -p /data/codex /data/inputs /projects
  find /data -xdev -uid 0 -exec chown -h node:node {} +
  if [ "$(stat -c %u /projects)" = 0 ]; then chown node:node /projects; fi
  exec gosu node "$0" "$@"
fi
mkdir -p /data/codex /data/inputs
# Legacy cloud deployments already supply a password but no separate signing
# secret. Persist a private random key so their compose file remains usable.
if [ "${OPL_WEBUI_AUTH_MODE:-}" = password ] || [ "${OPL_WEBUI_DEPLOYMENT_MODE:-}" = cloud ]; then
  if [ -z "${OPL_WEBUI_SESSION_SECRET:-}" ] && [ -z "${OPL_WEBUI_SESSION_SECRET_FILE:-}" ]; then
    export OPL_WEBUI_SESSION_SECRET_FILE=/data/.opl-studio/webui-session-secret
    node -e 'const fs=require("fs"); fs.mkdirSync("/data/.opl-studio",{recursive:true,mode:448}); try { fs.writeFileSync(process.env.OPL_WEBUI_SESSION_SECRET_FILE,require("crypto").randomBytes(48).toString("base64url"),{flag:"wx",mode:384}); } catch(e) { if(e.code!=="EEXIST")throw e; }'
  fi
fi
exec "$@"
