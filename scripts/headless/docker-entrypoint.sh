#!/bin/sh
set -eu
# Older OPL images wrote the App data volume as root. Repair only root-owned
# entries in that App-owned volume; never recurse into user project files.
if [ "$(id -u)" = 0 ]; then
  mkdir -p /data /projects
  find /data -xdev -uid 0 -exec chown -h node:node {} +
  if [ "$(stat -c %u /projects)" = 0 ]; then chown node:node /projects; fi
  exec gosu node "$@"
fi
exec "$@"
